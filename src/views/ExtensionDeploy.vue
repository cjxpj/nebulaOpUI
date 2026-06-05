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
          </template>
          <template v-else>
            <ElButton
              type="primary"
              size="small"
              :loading="installing && selectedComponent?.value === component.value"
              @click="installComponent(component)"
            >
              安装
            </ElButton>
          </template>
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
    <div v-if="taskId || showStatusDetails" class="status-section">
      <ElCard shadow="never" class="status-card">
        <template #header>
          <div class="status-header">
            <span>安装状态</span>
            <ElButton type="text" size="small" @click="clearStatus">清空</ElButton>
          </div>
        </template>

        <div class="status-content">
          <ElDescriptions :column="1" border size="small">
            <ElDescriptionsItem label="任务 ID">{{ taskId }}</ElDescriptionsItem>
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
import { ref, reactive, onMounted } from 'vue'
import {
  ElForm,
  ElFormItem,
  ElInput,
  ElButton,
  ElTag,
  ElDescriptions,
  ElDescriptionsItem,
  ElScrollbar,
  ElMessage,
  ElDialog,
  ElIcon,
} from 'element-plus'
import { config } from '@/config.js'
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
  php: 'NebulaData/private/php',
  python: 'NebulaData/private/python',
  napcat_bot: 'NebulaData/private/NapCat.Shell',
  ffmpeg: 'NebulaData/private/ffmpeg',
  silk_v3: 'NebulaData/private/ffmpeg/silk_v3',
}

const selectedComponent = ref(null)
const installing = ref(false)
const taskId = ref('')
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
  selectedComponent.value = component
}

/* ================= 一次性获取全部安装状态 ================= */
async function fetchAllStatuses() {
  loadingStatus.value = true
  try {
    const res = await fetch(config.apiBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'get_install_status',
      }),
    })

    if (!res.ok) {
      throw new Error('请求失败')
    }

    const data = await res.json()
    Object.assign(installStatus, data)
  } catch (error) {
    console.error('获取安装状态失败:', error)
    ElMessage.error('获取安装状态失败')
  } finally {
    loadingStatus.value = false
  }
}

onMounted(fetchAllStatuses)

/* ================= 查看安装详情 ================= */
function showInstallDetails(component) {
  selectedComponent.value = component
  taskId.value = 'installed_' + component.value
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

/* ================= 执行安装 ================= */
async function doInstall(component, params) {
  installing.value = true
  try {
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
      throw new Error('未知组件类型: ' + component.value)
    }

    const res = await fetch(config.apiBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: backendType,
        data: {
          component: component.value,
          params: params,
        },
      }),
    })

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`请求失败: ${res.status} ${errorText}`)
    }

    const data = await res.json()
    if (data.status === 'ok') {
      // 更新安装状态
      installStatus[component.value] = true
      // 生成一个同步任务ID用于显示状态
      taskId.value = 'sync_' + Date.now()
      // 直接更新状态数据
      statusData.status = 'completed'
      statusData.component = component.value
      statusData.output = data.output || []
      statusData.error = ''
      statusData.start_time = new Date().toISOString()
      statusData.end_time = new Date().toISOString()
      statusData.params = params

      ElMessage.success('安装完成')
    } else {
      throw new Error(data.error || '安装失败')
    }
  } catch (error) {
    console.error('安装失败:', error)
    ElMessage.error('安装失败: ' + (error.message || '未知错误'))
  } finally {
    installing.value = false
  }
}

/* ================= 轮询任务状态 ================= */
const polling = ref(false)

async function pollTaskStatus() {
  if (!taskId.value) {
    return
  }
  // 同步任务不需要检查状态
  if (taskId.value.startsWith('sync_')) {
    return
  }

  polling.value = true
  try {
    const res = await fetch(config.apiBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'install_status',
        data: {
          task_id: taskId.value,
        },
      }),
    })

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`请求失败: ${res.status} ${errorText}`)
    }

    const data = await res.json()
    Object.assign(statusData, data)

    // 如果状态不是完成或失败，3秒后再次检查
    if (data.status === 'pending' || data.status === 'running') {
      setTimeout(pollTaskStatus, 3000)
    }
  } catch (error) {
    console.error('获取状态失败:', error)
    ElMessage.error('获取状态失败: ' + (error.message || '未知错误'))
  } finally {
    polling.value = false
  }
}

/* ================= 清空状态 ================= */
function clearStatus() {
  taskId.value = ''
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
  selectedComponent.value = null
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
