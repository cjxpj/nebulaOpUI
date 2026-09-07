<template>
  <div class="page">
    <div class="page-header page-header-flex">
      <div class="page-header-actions">
        <span class="build-title">编译词库</span>
        <span class="current-path" :title="dicPath">{{ dicPath }}</span>
        <ElButton
          class="save-btn"
          :icon="DocumentChecked"
          :loading="saving"
          title="保存词库到 private/build/dic/main.n"
          @click="saveContent"
        >保存</ElButton>
        <ElButton
          class="run-btn"
          :icon="VideoPlay"
          :loading="running"
          :disabled="!platformSupported"
          title="运行编译产物（触发词 Main）"
          @click="runDic"
        >运行</ElButton>
        <ElButton
          class="build-btn"
          :icon="Box"
          :loading="building"
          :disabled="!platformSupported"
          title="编译词库为独立可执行文件"
          @click="buildDic"
        >编译</ElButton>
        <ElButton
          class="build-run-btn"
          type="primary"
          :icon="RefreshRight"
          :loading="building || running"
          :disabled="!platformSupported"
          title="编译并运行（触发词 Main）"
          @click="buildAndRunDic"
        >编译并运行</ElButton>
      </div>
    </div>

    <ElAlert
      v-if="!platformSupported"
      type="warning"
      title="当前平台不支持编译"
      description="词库编译为独立可执行文件仅支持 Windows 平台，请在 Windows 环境下使用。"
      :closable="false"
      show-icon
      class="platform-alert"
    />

    <!-- 词库编辑器 -->
    <div ref="editorEl" class="dic-editor" />

    <div class="form-hint">
      编辑 {{ dicPath }}，点击「编译」将把该词库嵌入引擎并打包为独立可执行文件（需本机 Go 工具链与 Nebula 源码）
    </div>

    <!-- 编译输出 -->
    <div class="output-zone">
      <div v-if="building || running" class="output-placeholder">
        <ElEmpty
          :description="building ? '正在编译打包，首次编译需构建引擎依赖，请稍候…' : '正在运行（触发词 Main）…'"
          :image-size="60"
        />
      </div>
      <template v-else>
        <div v-if="buildError" class="error-box">{{ buildError }}</div>
        <div v-if="runErr" class="error-box">{{ runErr }}</div>
        <div v-if="buildResult" class="build-result">
          <div v-if="buildResult.output" class="build-output">
            <div class="build-output-label">产物已生成</div>
            <div class="build-output-path">{{ buildResult.output }}</div>
          </div>
          <pre v-if="buildResult.log" class="build-log">{{ buildResult.log }}</pre>
        </div>
        <div v-if="runOutput" class="build-result">
          <div class="build-output-label">运行输出（Main）</div>
          <pre class="build-log">{{ runOutput }}</pre>
        </div>
        <div v-if="!buildResult && !runOutput && !buildError && !runErr" class="output-placeholder">
          <ElEmpty description="点击「编译」打包，点击「运行」执行 Main 触发词" :image-size="60" />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, inject } from 'vue'
import { Box, VideoPlay, RefreshRight, DocumentChecked } from '@element-plus/icons-vue'
import { monaco, loadDicFuncs } from '@/monacoNebula.js'
import { apiPost } from '@/api.js'

/* ================= 主题 ================= */
const isDarkMode = inject('isDarkMode')

/* ================= 固定词库路径 ================= */
const dicPath = ref('private/build/dic/main.n')
const dicContent = ref('')

/* ================= 平台限制（编译仅限 Windows） ================= */
const platformSupported = ref(
  typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent)
)

/* ================= 编辑器 ================= */
const editorEl = ref(null)
let editor = null
let suppressChange = false

function createEditor() {
  if (editor || !editorEl.value) return
  editor = monaco.editor.create(editorEl.value, {
    value: dicContent.value,
    language: 'nebula',
    theme: isDarkMode.value ? 'nebula-dark' : 'nebula-light',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "'JetBrains Mono', Consolas, 'Courier New', monospace",
    lineNumbers: 'on',
    folding: true,
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    tabSize: 4,
    insertSpaces: false,
    roundedSelection: false,
    renderWhitespace: 'selection',
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    padding: { top: 8, bottom: 8 },
    quickSuggestions: false,
    suggestOnTriggerCharacters: true,
    inlineSuggest: { enabled: true },
    fixedOverflowWidgets: true,
    contextmenu: false,
  })
  editor.onDidChangeModelContent(() => {
    if (suppressChange) return
    dicContent.value = editor.getValue()
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveContent())
}

function setEditorValue(text) {
  dicContent.value = text
  if (editor) {
    suppressChange = true
    editor.setValue(text)
    suppressChange = false
  }
}

watch(isDarkMode, (dark) => {
  editor?.updateOptions({ theme: dark ? 'nebula-dark' : 'nebula-light' })
})

/* ================= 读取词库内容 ================= */
async function loadDicContent() {
  try {
    const data = await apiPost({ type: 'dic_get_content', data: { path: dicPath.value } })
    if (data && data.status === 'not_found') {
      // 文件尚不存在：显示空白编辑器，保存/编译时自动创建 private/build/dic/main.n
      setEditorValue('')
      return
    }
    setEditorValue(data.content || '')
  } catch (e) {
    console.warn('读取词库内容失败:', e)
  }
}

const saving = ref(false)

async function saveContent() {
  saving.value = true
  try {
    await apiPost({
      type: 'dic_save_content',
      data: { path: dicPath.value, content: dicContent.value },
    })
    ElMessage.success('词库已保存')
  } catch (e) {
    ElMessage.error('保存失败: ' + (e.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

/* ================= 编译打包 ================= */
const building = ref(false)
const buildResult = ref(null)
const buildError = ref('')

async function buildDic() {
  building.value = true
  buildError.value = ''
  buildResult.value = null
  try {
    // 编译的是磁盘上的文件，先保存当前编辑内容（自动创建目录与文件）
    await apiPost({
      type: 'dic_save_content',
      data: { path: dicPath.value, content: dicContent.value },
    })
    // 启动打包任务（异步），拿到 taskId 后轮询进度
    const start = await apiPost({ type: 'dic_build', data: { path: dicPath.value } })
    const taskId = start && start.taskId
    if (!taskId) {
      buildError.value = '后端未返回打包任务 ID'
      return
    }
    // 轮询直到完成
    let st
    for (let i = 0; i < 600; i++) {
      await new Promise((r) => setTimeout(r, 1500))
      st = await apiPost({ type: 'dic_build_status', data: { task_id: taskId } })
      if (st && st.done) break
    }
    if (!st || !st.done) {
      buildError.value = '编译超时，请稍后在源码 dist/build 目录查看产物'
      return
    }
    if (st.error) {
      buildError.value = st.error
      if (st.log) buildResult.value = { output: '', log: st.log }
    } else {
      buildResult.value = { output: st.output, log: st.log }
      ElMessage.success('编译完成')
    }
  } catch (e) {
    buildError.value = e.message || '编译失败'
  } finally {
    building.value = false
  }
}

/* ================= 运行 ================= */
const running = ref(false)
const runOutput = ref('')
const runErr = ref('')

async function runDic() {
  running.value = true
  runOutput.value = ''
  runErr.value = ''
  try {
    const data = await apiPost({ type: 'dic_run' })
    if (data && data.status === 'error') {
      runErr.value = data.error || '运行失败'
      return
    }
    runOutput.value = data.runOutput || ''
    runErr.value = data.runErr || ''
    if (!runErr.value && runOutput.value === '') {
      runOutput.value = '(无输出)'
    }
  } catch (e) {
    runErr.value = e.message || '运行失败'
  } finally {
    running.value = false
  }
}

/* 编译并运行：先编译，成功后自动运行（触发词 Main） */
async function buildAndRunDic() {
  await buildDic()
  if (buildError.value || !buildResult.value || !buildResult.value.output) {
    return
  }
  await runDic()
}

/* ================= 生命周期 ================= */
onMounted(() => {
  loadDicFuncs()
  createEditor()
  loadDicContent()
})

onBeforeUnmount(() => {
  editor?.dispose()
})
</script>

<style scoped>
.page {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.page-header {
  margin-bottom: 24px;
}

.page-header-flex {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
}

.page-header-actions {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-header-actions .save-btn {
  margin-left: auto;
}

.platform-alert {
  margin-bottom: 12px;
}

.build-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.current-path {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== 编辑器 ===== */
.dic-editor {
  box-sizing: border-box;
  width: 100%;
  height: 480px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-bg-color);
}

.form-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* ===== 编译输出 ===== */
.output-zone {
  position: relative;
  flex: 1;
  min-height: 200px;
  margin-top: 16px;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-light);
}

.error-box {
  padding: 12px 16px;
  border: 1px solid var(--el-color-danger-light-5);
  background: var(--el-color-danger-light-9);
  border-radius: 8px;
  color: var(--el-color-danger);
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 12px;
}

.output-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  box-sizing: border-box;
}

.build-result {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.build-output-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
  margin-bottom: 6px;
}

.build-output-path {
  font-size: 13px;
  font-family: 'JetBrains Mono', Consolas, 'Courier New', monospace;
  color: var(--el-color-primary);
  word-break: break-all;
}

.build-log {
  margin: 0;
  padding: 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  font-size: 12px;
  font-family: 'JetBrains Mono', Consolas, 'Courier New', monospace;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 240px;
  overflow: auto;
}

.build-empty {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

/* ===== 响应式 ===== */
@media (max-width: 768px) {
  .dic-editor {
    height: 360px;
  }

  .current-path {
    max-width: 140px;
  }
}
</style>
