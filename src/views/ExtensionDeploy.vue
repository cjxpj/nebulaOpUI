<template>
  <div class="extension-deploy">
    <!-- 头部标题 -->
    <div class="page-header">
      <h2 class="page-title">扩展部署</h2>
      <p class="page-subtitle">管理和安装服务器组件扩展</p>
    </div>

    <!-- 组件卡片网格 -->
    <div class="components-grid">
      <div
        v-for="component in components"
        :key="component.value"
        class="component-card"
        :class="{ 'is-installed': installStatus[component.value], 'is-selected': selectedComponent?.value === component.value }"
        @click="selectComponent(component)"
      >
        <!-- 左侧装饰条 -->
        <div class="card-accent" :data-type="component.value"></div>

        <!-- 图标区 -->
        <div class="card-icon-box" :data-type="component.value">
          <ElIcon :size="28">
            <component :is="component.icon" />
          </ElIcon>
        </div>

        <!-- 信息区 -->
        <div class="card-info">
          <div class="card-header-row">
            <h3 class="card-title">{{ component.label }}</h3>
            <template v-if="!loadingStatus">
              <ElTag
                v-if="installStatus[component.value]"
                type="success"
                size="small"
                effect="dark"
                class="card-badge"
              >
                已安装
              </ElTag>
              <span v-else class="card-badge card-badge--idle">未安装</span>
            </template>
          </div>
          <p class="card-desc">{{ component.description }}</p>
        </div>

        <!-- 操作区 -->
        <div class="card-action" @click.stop>
          <template v-if="loadingStatus">
            <ElTag type="info" size="small" class="action-loading">加载中</ElTag>
          </template>
          <template v-else-if="installStatus[component.value]">
            <ElButton
              type="primary"
              size="small"
              plain
              @click="showInstallDetails(component)"
            >
              查看详情
            </ElButton>
            <ElButton
              type="danger"
              size="small"
              plain
              @click="uninstallComponent(component)"
            >
              卸载
            </ElButton>
          </template>
          <template v-else>
            <template v-if="activeTask && selectedComponent?.value === component.value">
              <ElButton
                type="danger"
                size="small"
                plain
                @click="cancelInstall"
              >
                取消
              </ElButton>
            </template>
            <template v-else>
              <ElButton
                type="primary"
                size="small"
                @click="installComponent(component)"
              >
                安装
              </ElButton>
            </template>
          </template>
        </div>

        <!-- 进度条（安装中的组件） -->
        <div
          v-if="activeTask && selectedComponent?.value === component.value"
          class="card-progress"
        >
          <div class="progress-header">
            <span class="progress-label">
              <template v-if="installProgress.reconnecting">重连中...</template>
              <template v-else>{{ installProgress.status === 'running' ? '安装中...' : installProgress.status === 'completed' ? '安装完成' : '安装失败' }}</template>
            </span>
            <span class="progress-percent">{{ Math.round(installProgress.progress || 0) }}%</span>
          </div>
          <ElProgress
            :percentage="Math.round(installProgress.progress || 0)"
            :status="installProgress.status === 'completed' ? 'success' : installProgress.status === 'failed' ? 'exception' : ''"
            :stroke-width="8"
          />
          <div v-if="installProgress.output && installProgress.output.length" class="progress-output">
            <span class="output-current">{{ installProgress.output[installProgress.output.length - 1] }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- NapCat 参数弹窗 -->
    <ElDialog
      v-model="showNapCatDialog"
      title="NapCat 安装配置"
      width="400px"
      :close-on-click-modal="false"
    >
      <ElForm :model="napCatForm" label-width="80px">
        <ElFormItem label="QQ 账号" required>
          <ElInput
            v-model="napCatForm.qq"
            placeholder="请输入 QQ 账号"
            @keyup.enter="confirmNapCatInstall"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <span class="dialog-footer">
          <ElButton @click="showNapCatDialog = false">取消</ElButton>
          <ElButton type="primary" @click="confirmNapCatInstall">确定</ElButton>
        </span>
      </template>
    </ElDialog>

    <!-- 安装状态 -->
    <div v-if="showStatusDetails" class="status-section">
      <ElCard shadow="never" class="status-card">
        <template #header>
          <div class="status-header">
            <span>安装状态</span>
          </div>
        </template>

        <div class="status-content">
          <ElDescriptions :column="1" border size="small">
            <ElDescriptionsItem label="组件">{{
              selectedComponent?.label || '未知'
            }}</ElDescriptionsItem>
            <ElDescriptionsItem label="状态">
              <ElTag :type="statusTypeMap[statusData.status]" effect="dark" size="small">
                {{ statusTextMap[statusData.status] }}
              </ElTag>
            </ElDescriptionsItem>
            <ElDescriptionsItem label="安装路径">{{
              installPathMap[selectedComponent?.value] || '未知'
            }}</ElDescriptionsItem>
          </ElDescriptions>

          <!-- 输出日志 -->
          <div v-if="statusData.output && statusData.output.length" class="output-log">
            <h4>安装日志</h4>
            <ElScrollbar height="200px">
              <div class="log-content">
                <div
                  v-for="(line, index) in statusData.output"
                  :key="index"
                  class="log-line"
                  :class="{
                    'log-line-error':
                      line.toLowerCase().includes('error') || line.toLowerCase().includes('fail'),
                    'log-line-success':
                      line.toLowerCase().includes('success') ||
                      line.toLowerCase().includes('complete'),
                  }"
                >
                  {{ line }}
                </div>
              </div>
            </ElScrollbar>
          </div>
        </div>
      </ElCard>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import {
  ElProgress,
  ElForm,
  ElFormItem,
  ElInput,
  ElButton,
  ElTag,
  ElDescriptions,
  ElDescriptionsItem,
  ElScrollbar,
  ElMessage,
  ElMessageBox,
  ElDialog,
  ElIcon,
} from 'element-plus'
import { config } from '@/config.js'
import { apiPost } from '@/api.js'
import { Document, Monitor, Message, VideoCamera, Mic } from '@element-plus/icons-vue'

/* ================= 组件数据 ================= */
const components = [
  {
    value: 'php',
    label: 'PHP',
    description: '服务器端脚本语言，用于运行 Web 应用',
    icon: Document,
  },
  {
    value: 'python',
    label: 'Python',
    description: '通用编程语言，支持多种应用场景',
    icon: Document,
  },
  {
    value: 'napcat_bot',
    label: 'NapCat',
    description: 'QQ 机器人框架，需要 QQ 账号',
    icon: Message,
  },
  {
    value: 'ffmpeg',
    label: 'FFmpeg',
    description: '音视频处理工具，支持格式转换',
    icon: VideoCamera,
  },
  {
    value: 'silk_v3',
    label: 'Silk V3',
    description: '语音编解码库，用于语音处理',
    icon: Mic,
  },
]

/* ================= 安装路径映射 ================= */
const installPathMap = {
  php: 'NebulaData/private/extensions/php',
  python: 'NebulaData/private/extensions/python',
  napcat_bot: 'NebulaData/private/extensions/NapCat.Shell',
  ffmpeg: 'NebulaData/private/extensions/ffmpeg',
  silk_v3: 'NebulaData/private/extensions/silk_v3',
}

const selectedComponent = ref(null)
const activeTask = ref(null)     // 当前安装任务的 task_id
const pollingTimer = ref(null)   // 轮询定时器（setTimeout id）
const consecutiveErrors = ref(0) // 连续错误次数
const reinstallAttempts = ref(0) // not_found 后重新安装次数
const maxConsecutiveErrors = 10  // 超过此值停止轮询
const maxReinstallAttempts = 3   // 最多重新安装次数
let pollingActive = false        // 防止并发轮询
const showNapCatDialog = ref(false)
const showStatusDetails = ref(false)

/* ================= 安装状态 ================= */
const installStatus = reactive({})
const loadingStatus = ref(true)

/* ================= NapCat 表单 ================= */
const napCatForm = reactive({
  qq: '',
})

/* ================= 状态数据 ================= */
const statusData = reactive({
  status: '',
  component: '',
  output: [],
  error: '',
  start_time: null,
  end_time: null,
  params: {},
})

/* ================= 映射 ================= */
const statusTextMap = {
  pending: '等待中',
  running: '运行中',
  completed: '完成',
  failed: '失败',
}

const statusTypeMap = {
  pending: 'info',
  running: 'warning',
  completed: 'success',
  failed: 'danger',
}

/* ================= 选择组件 ================= */
function selectComponent(component) {
  // 安装中不允许切换组件，锁定进度条所在卡片
  if (activeTask.value) return
  selectedComponent.value = component
  showStatusDetails.value = false
}

/* ================= 安装进度 ================= */
const installProgress = reactive({
  status: '',       // running / completed / failed / reconnecting
  component: '',
  output: [],
  error: '',
  progress: 0,
  reconnecting: false, // 断线重连中
})

/* ================= 一次性获取全部安装状态 ================= */
async function fetchAllStatuses() {
  loadingStatus.value = true
  try {
    const data = await apiPost({
        type: 'get_install_status',
      })

    Object.assign(installStatus, data)
  } catch (error) {
    console.error('获取安装状态失败:', error)
    ElMessage.error('获取安装状态失败')
  } finally {
    loadingStatus.value = false
  }
}

onMounted(() => {
  fetchAllStatuses()
  resumePendingTask()
})
onBeforeUnmount(() => {
  stopPolling()
  activeTask.value = null
  pollingActive = false
})

/* ================= 查看安装详情 ================= */
function showInstallDetails(component) {
  // 安装中不允许切换，避免进度条跳走
  if (activeTask.value) return
  selectedComponent.value = component
  statusData.status = 'completed'
  statusData.component = component.value
  statusData.output = ['该组件已安装']
  statusData.error = ''
  statusData.start_time = ''
  statusData.end_time = ''
  statusData.params = {}
  showStatusDetails.value = true
}

/* ================= 安装组件 ================= */
function installComponent(component) {
  // 已有安装任务在进行中，不允许切换
  if (activeTask.value) {
    ElMessage.warning('已有安装任务在进行中，请等待完成或取消')
    return
  }
  selectedComponent.value = component

  // 如果是 NapCat，显示参数弹窗
  if (component.value === 'napcat_bot') {
    napCatForm.qq = ''
    showNapCatDialog.value = true
  } else {
    // 其他组件直接安装
    doInstall(component, {})
  }
}

/* ================= 确认 NapCat 安装 ================= */
async function confirmNapCatInstall() {
  if (!napCatForm.qq) {
    ElMessage.warning('请输入 QQ 账号')
    return
  }

  showNapCatDialog.value = false
  doInstall(selectedComponent.value, { qq: napCatForm.qq })
}

/* ================= 持久化任务状态 ================= */
const PENDING_TASK_KEY = '_nebula_pending_install'

function savePendingTask(taskId, componentValue) {
  localStorage.setItem(PENDING_TASK_KEY, JSON.stringify({ task_id: taskId, component: componentValue, ts: Date.now() }))
}

function clearPendingTask() {
  localStorage.removeItem(PENDING_TASK_KEY)
}

function resumePendingTask() {
  try {
    const raw = localStorage.getItem(PENDING_TASK_KEY)
    if (!raw) return
    const pending = JSON.parse(raw)
    // 超过 30 分钟视为过期
    if (Date.now() - pending.ts > 30 * 60 * 1000) { clearPendingTask(); return }
    if (!pending.task_id || !pending.component) { clearPendingTask(); return }

    const comp = components.find(c => c.value === pending.component)
    if (!comp) { clearPendingTask(); return }

    selectedComponent.value = comp
    activeTask.value = pending.task_id
    installProgress.status = 'running'
    installProgress.progress = 0
    installProgress.output = []
    installProgress.error = ''
    startPolling(pending.task_id)
  } catch (e) {
    console.error('恢复安装任务失败:', e)
    clearPendingTask()
  }
}

/* ================= 执行安装 ================= */
async function doInstall(component, params) {
  // 防止并发安装
  if (activeTask.value) {
    ElMessage.warning('已有安装任务在进行中，请等待完成或取消')
    return
  }
  if (!component) {
    ElMessage.error('未选择组件')
    return
  }

  // 映射组件到后端接口类型
  const typeMap = {
    php: 'install_php',
    python: 'install_python',
    napcat_bot: 'install_napcat_bot',
    ffmpeg: 'install_ffmpeg',
    silk_v3: 'install_silk_v3',
  }
  const backendType = typeMap[component.value]
  if (!backendType) {
    ElMessage.error('未知组件类型: ' + component.value)
    return
  }

  try {
    const data = await apiPost({
      type: backendType,
      data: {
        component: component.value,
        params: params,
      },
    }, { noRetry: true }) // 不重试安装请求，避免创建重复任务

    if (data.status === 'ok' && data.task_id) {
      // 异步任务已创建
      activeTask.value = data.task_id
      savePendingTask(data.task_id, component.value)
      installProgress.status = 'running'
      installProgress.progress = 0
      installProgress.output = []
      installProgress.error = ''
      startPolling(data.task_id)
    } else if (data.status === 'ok') {
      // 已安装（同步返回），直接标记
      installStatus[component.value] = true
      ElMessage.success('已安装，无需重复安装')
    } else if (data.status === 'error') {
      ElMessage.error(data.error || '安装失败')
    }
  } catch (error) {
    console.error('安装失败:', error)
    ElMessage.error('安装失败: ' + (error.message || '未知错误'))
  }
}

/* ================= 卸载组件 ================= */
async function uninstallComponent(component) {
  try {
    await ElMessageBox.confirm(
      `确定要卸载 ${component.label} 吗？此操作将删除安装目录，不可恢复。`,
      '确认卸载',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' },
    )
  } catch (e) {
    console.error('卸载确认弹窗:', e)
    return // 用户取消
  }

  // 如果该组件正在安装中，先取消
  if (activeTask.value && selectedComponent.value?.value === component.value) {
    stopPolling()
    activeTask.value = null
    Object.assign(installProgress, {
      status: '', component: '', output: [], error: '', progress: 0, reconnecting: false,
    })
  }

  try {
    const data = await apiPost({
      type: 'uninstall',
      data: { component: component.value },
    })

    if (data.status === 'ok') {
      installStatus[component.value] = false
      // 如果卸载的是当前选中的组件，隐藏详情和清空选中
      if (selectedComponent.value?.value === component.value) {
        showStatusDetails.value = false
        selectedComponent.value = null
      }
      ElMessage.success(component.label + ' 已卸载')
    } else {
      ElMessage.error(data.error || '卸载失败')
    }
  } catch (error) {
    console.error('卸载失败:', error)
    ElMessage.error('卸载失败: ' + (error.message || '未知错误'))
  }
}

/* ================= 轮询安装进度（递归 setTimeout，防止回调重叠） ================= */
function startPolling(taskId) {
  stopPolling()
  consecutiveErrors.value = 0
  reinstallAttempts.value = 0
  installProgress.reconnecting = false

  schedulePoll(taskId)
}

function schedulePoll(taskId) {
  // 防止任务被切换后旧回调继续执行
  if (activeTask.value !== taskId) return

  pollingTimer.value = setTimeout(async () => {
    if (activeTask.value !== taskId) return

    if (pollingActive) return // 上一轮还在跑，跳过
    pollingActive = true

    try {
      const data = await apiPost({
        type: 'install_progress',
        data: { task_id: taskId },
      }, { noRetry: true })

      // 后台返回后再次确认 taskId 未变
      if (activeTask.value !== taskId) { pollingActive = false; return }

      consecutiveErrors.value = 0
      installProgress.reconnecting = false

      installProgress.status = data.status || 'running'
      installProgress.progress = data.progress || 0
      installProgress.output = data.output || []
      installProgress.error = data.error || ''

      if (data.status === 'completed') {
        stopPolling()
        clearPendingTask()
        if (selectedComponent.value) {
          installStatus[selectedComponent.value.value] = true
        }
        activeTask.value = null
        ElMessage.success('安装完成')
      } else if (data.status === 'cancelled') {
        stopPolling()
        clearPendingTask()
        activeTask.value = null
        ElMessage.info('安装已取消')
      } else if (data.status === 'failed') {
        stopPolling()
        clearPendingTask()
        activeTask.value = null
        ElMessage.error('安装失败: ' + (data.error || '未知错误'))
      } else if (data.status === 'not_found') {
        // 后端重启导致任务丢失，尝试重新发起安装（最多 maxReinstallAttempts 次）
        stopPolling()
        activeTask.value = null
        if (reinstallAttempts.value < maxReinstallAttempts && selectedComponent.value) {
          reinstallAttempts.value++
          clearPendingTask()
          ElMessage.warning(`后端已重启，正在重新发起安装 (${reinstallAttempts.value}/${maxReinstallAttempts})...`)
          installComponent(selectedComponent.value)
        } else if (reinstallAttempts.value >= maxReinstallAttempts) {
          clearPendingTask()
          ElMessage.error('多次重装失败，请检查后端是否正常')
          installProgress.status = 'failed'
          installProgress.error = '后端反复重启，安装失败'
        }
      } else {
        // running — 继续轮询
        pollingActive = false
        schedulePoll(taskId)
      }
    } catch (error) {
      if (activeTask.value !== taskId) { pollingActive = false; return }

      consecutiveErrors.value++
      console.error(`获取进度失败 (${consecutiveErrors.value}/${maxConsecutiveErrors}):`, error.message)

      if (consecutiveErrors.value >= maxConsecutiveErrors) {
        stopPolling()
        activeTask.value = null
        clearPendingTask()
        installProgress.status = 'failed'
        installProgress.error = '连接失败次数过多，请检查后端是否运行'
        ElMessage.error('连接失败，已停止轮询')
      } else {
        installProgress.reconnecting = true
        installProgress.status = 'running'
        pollingActive = false
        schedulePoll(taskId) // 继续递归轮询
      }
    }
    pollingActive = false
  }, 500)
}

function stopPolling() {
  if (pollingTimer.value) {
    clearTimeout(pollingTimer.value)
    pollingTimer.value = null
  }
  pollingActive = false
  consecutiveErrors.value = 0
}

function cancelInstall() {
  const taskId = activeTask.value
  stopPolling()
  clearPendingTask()
  activeTask.value = null
  reinstallAttempts.value = 0
  // 清除该组件的安装状态
  if (selectedComponent.value) {
    delete installStatus[selectedComponent.value.value]
  }
  Object.assign(installProgress, {
    status: '', component: '', output: [], error: '', progress: 0, reconnecting: false,
  })
  // 通知后端取消
  if (taskId) {
    apiPost({ type: 'cancel_install', data: { task_id: taskId } }, { noRetry: true })
      .catch(() => {
        console.warn('取消安装请求发送失败，后台任务可能仍在运行')
        ElMessage.warning('取消请求发送失败，安装可能仍在后台进行')
      })
  } else {
    ElMessage.info('安装已取消')
  }
}

/* ================= 清空状态 ================= */
function clearStatus() {
  stopPolling()
  activeTask.value = null
  showStatusDetails.value = false
  Object.assign(statusData, {
    status: '',
    component: '',
    output: [],
    error: '',
    start_time: null,
    end_time: null,
    params: {},
  })
  Object.assign(installProgress, {
    status: '',
    component: '',
    output: [],
    error: '',
    progress: 0,
    reconnecting: false,
  })
  selectedComponent.value = null
  consecutiveErrors.value = 0
  ElMessage.info('状态已清空')
}

/* ================= 时间格式化 ================= */
function formatTime(time) {
  if (!time) return '无'
  const date = new Date(time)
  return date.toLocaleString()
}
</script>

<style scoped>
/* ==================== 页面布局 ==================== */
.extension-deploy {
  width: 100%;
  min-height: 100vh;
  padding: 32px;
  box-sizing: border-box;
}

/* ==================== 页面标题 ==================== */
.page-header {
  margin-bottom: 32px;
}

.page-title {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  letter-spacing: -0.3px;
}

.page-subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

/* ==================== 组件网格 ==================== */
.components-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 16px;
  margin-bottom: 30px;
}

/* ==================== 卡片主体 ==================== */
.component-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.component-card:hover {
  border-color: var(--el-color-primary-light-5);
  transform: translateY(-3px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08);
}

.component-card.is-selected {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary);
}

.component-card.is-installed {
  border-color: var(--el-color-success-light-5);
}

/* ==================== 左侧彩色装饰条 ==================== */
.card-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  border-radius: 12px 0 0 12px;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.component-card:hover .card-accent {
  width: 6px;
}

/* 各组件装饰条颜色 */
.card-accent[data-type='php']       { background: #5a54a4; }
.card-accent[data-type='python']    { background: #3776ab; }
.card-accent[data-type='napcat_bot']{ background: #1e88e5; }
.card-accent[data-type='ffmpeg']    { background: #00bcd4; }
.card-accent[data-type='silk_v3']   { background: #4caf50; }

/* ==================== 图标区 ==================== */
.card-icon-box {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.component-card:hover .card-icon-box {
  transform: scale(1.08);
}

.card-icon-box[data-type='php'] {
  background: linear-gradient(135deg, #ebebf5 0%, #dedcf0 100%);
  color: #5a54a4;
}

.card-icon-box[data-type='python'] {
  background: linear-gradient(135deg, #e3f0fa 0%, #d4e6f5 100%);
  color: #3776ab;
}

.card-icon-box[data-type='napcat_bot'] {
  background: linear-gradient(135deg, #e3f0fd 0%, #d0e4f7 100%);
  color: #1e88e5;
}

.card-icon-box[data-type='ffmpeg'] {
  background: linear-gradient(135deg, #e0f7fa 0%, #cfeef2 100%);
  color: #00838f;
}

.card-icon-box[data-type='silk_v3'] {
  background: linear-gradient(135deg, #e8f5e9 0%, #d5ecd6 100%);
  color: #388e3c;
}

/* ==================== 信息区域 ==================== */
.card-info {
  flex: 1;
  min-width: 0;
}

.card-header-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

.card-badge {
  flex-shrink: 0;
  font-size: 11px;
}

.card-badge--idle {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-placeholder);
  font-weight: 500;
}

.card-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ==================== 操作区域 ==================== */
.card-action {
  flex-shrink: 0;
}

.action-loading {
  pointer-events: none;
}

/* ==================== 状态区域 ==================== */
.status-section {
  margin-top: 30px;
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.status-content {
  padding: 0;
}

/* ==================== 输出日志 ==================== */
.output-log {
  margin-top: 20px;
}

.output-log h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.log-content {
  padding: 16px;
  font-family: 'Menlo', 'Monaco', 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  color: var(--el-text-color-primary);
}

.log-line {
  margin-bottom: 4px;
  white-space: pre-wrap;
  word-break: break-word;
}

.log-line-error {
  color: var(--el-color-danger);
  font-weight: 500;
}

.log-line-success {
  color: var(--el-color-success);
  font-weight: 500;
}

/* ==================== 卡片内进度条 ==================== */
.card-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 10px 16px 12px 16px;
  background: var(--el-bg-color-overlay);
  border-top: 1px solid var(--el-border-color-lighter);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.progress-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
}

.progress-percent {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-primary);
}

.progress-output {
  margin-top: 6px;
}

.output-current {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

/* ==================== 弹窗底部 ==================== */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
}

/* ==================== 响应式 ==================== */
@media (max-width: 768px) {
  .extension-deploy {
    padding: 16px;
  }

  .page-header {
    margin-bottom: 20px;
  }

  .page-title {
    font-size: 20px;
  }

  .components-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .component-card {
    padding: 16px;
  }

  .card-icon-box {
    width: 44px;
    height: 44px;
    border-radius: 12px;
  }
}

@media (max-width: 480px) {
  .extension-deploy {
    padding: 12px;
  }

  .page-title {
    font-size: 16px;
  }

  .page-subtitle {
    font-size: 12px;
  }

  .component-card {
    padding: 12px 14px;
    gap: 10px;
    border-radius: 10px;
  }

  .card-icon-box {
    width: 40px;
    height: 40px;
    border-radius: 10px;
  }

  .card-title {
    font-size: 14px;
  }

  .card-desc {
    font-size: 12px;
  }
}

/* ==================== 触摸优化 ==================== */
@media (hover: none) and (pointer: coarse) {
  .component-card {
    cursor: default;
    transition: none;
  }

  .component-card:hover {
    transform: none;
    box-shadow: none;
    border-color: var(--el-border-color-lighter);
  }

  .component-card:hover .card-icon-box {
    transform: none;
  }

  .component-card:hover .card-accent {
    width: 4px;
  }

  .component-card:active {
    background: var(--el-fill-color-light);
  }
}
</style>
