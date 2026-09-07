<script setup>
import { ref, computed, onMounted, onBeforeUnmount, inject } from 'vue'
import {
  Refresh, Plus, Delete, CopyDocument, Connection,
  ChatDotRound, Link, Key, FolderOpened, Operation, SwitchButton,
  WarningFilled, Setting, QuestionFilled,
} from '@element-plus/icons-vue'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'
import { injectSandboxInstance } from './qqSandboxShared.js'

/* ================= 移动端适配 ================= */
const { isMobile } = useMobile()

const instances = ref([])
const loading = ref(false)
const loadFailed = ref(false)
const adding = ref(false)
const savingMap = ref({})
let pollTimer = null

function getTitle(i) { return i.remark || `实例 ${i.section}` }

/* ================= 弹窗编辑状态 ================= */
const dialogVisible = ref(false)
const dialogMode = ref('edit') // 'add' 添加 / 'edit' 编辑
const editingInstance = ref(null)
const editForm = ref(null)
const dialogTitle = computed(() => {
  if (dialogMode.value === 'add') return '添加实例'
  return editingInstance.value ? `编辑配置 - ${getTitle(editingInstance.value)}` : '编辑配置'
})
const dialogSaving = computed(() => {
  if (dialogMode.value === 'add') return adding.value
  return editingInstance.value ? Boolean(savingMap.value[editingInstance.value.section]) : false
})

/* ================= 沙箱测试跳转 ================= */
// 注入实例信息并跳转到独立沙箱测试导航页
const navigate = inject('navigate')
function openSandbox(inst) {
  injectSandboxInstance(inst)
  if (navigate) navigate('qq-sandbox')
}

/* ================= 连接状态 ================= */
function connText(inst) {
  if (!inst.open) return '未连接'
  if (!inst.ws) return '未开启WS'
  return inst.connected ? '已连接' : '未连接'
}
function connClass(inst) {
  if (!inst.open || !inst.ws) return 'off'
  return inst.connected ? 'on' : 'warn'
}

/* ================= 复制 ================= */
async function copyField(text, label) {
  if (!text) return ElMessage.warning(`${label} 为空，无需复制`)
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(`${label} 已复制`)
  } catch { ElMessage.error('复制失败') }
}

/* ================= 数据加载 ================= */
async function loadConfig() {
  loading.value = true; loadFailed.value = false
  try {
    const data = await apiPost({ type: 'get_qq_list' })
    instances.value = (data.instances || []).map(item => ({
      section: item.section,
      open: Boolean(item.config.open),
      dic: item.config.dic || 'private/bot/qq',
      path: item.config.path || 'qq-bot',
      appid: item.config.appid || '',
      secret: item.config.secret || '',
      at_compat: item.config.at_compat === undefined ? true : Boolean(item.config.at_compat),
      filter_slash: item.config.filter_slash === undefined ? true : Boolean(item.config.filter_slash),
      debug: Boolean(item.config.debug),
      ws: Boolean(item.config.ws),
      ws_intents: Number(item.config.ws_intents) || 0,
      remark: item.config.remark || '',
      bot_name: item.config.bot_name || '',
      bot_avatar: item.config.bot_avatar || '',
      robot: item.config.robot || '',
      connected: Boolean(item.config.connected),
    }))
    if (instances.value.length === 0) {
      instances.value.push({ section: 'QQ', open: false, dic: 'private/bot/qq', path: 'qq-bot', appid: '', secret: '', at_compat: true, filter_slash: true, debug: false, ws: true, ws_intents: 0, remark: 'bot1', robot: '', connected: false })
    }
  } catch (e) { console.error('获取 QQ 配置失败:', e); loadFailed.value = true; ElMessage.error('获取 QQ 配置失败') }
  finally { loading.value = false }
}

/* 轮询刷新连接状态 / 机器人信息（不覆盖弹窗中的编辑） */
async function refreshStatus() {
  if (loadFailed.value) return
  try {
    const data = await apiPost({ type: 'get_qq_list' })
    const bySection = {}
    ;(data.instances || []).forEach(item => { bySection[item.section] = item.config })
    instances.value.forEach(inst => {
      const c = bySection[inst.section]
      if (c) {
        inst.connected = Boolean(c.connected)
        if (c.bot_name) inst.bot_name = c.bot_name
        if (c.bot_avatar) inst.bot_avatar = c.bot_avatar
      }
    })
  } catch (e) { /* 轮询失败静默处理 */ }
}

/* ================= 保存（返回是否成功） ================= */
async function saveInstance(instance, silent) {
  if (loadFailed.value) return false
  if (instance.open && !instance.path) { ElMessage.error('访问路径不能为空'); return false }
  if (instance.open && !instance.appid) { ElMessage.error('APPID 不能为空'); return false }
  const dup = instances.value.find(i => i !== instance && i.remark === instance.remark)
  if (dup) { ElMessage.error(`备注名 "${instance.remark}" 已被使用`); return false }
  savingMap.value[instance.section] = true
  try {
    await apiPost({ type: 'save_qq', data: { section: instance.section, config: {
        open: instance.open, dic: instance.dic, path: instance.path, appid: instance.appid,
        secret: instance.secret, at_compat: instance.at_compat, filter_slash: instance.filter_slash, debug: instance.debug, ws: instance.ws,
        ws_intents: instance.ws_intents, remark: instance.remark, robot: instance.robot,
      }}})
    if (!silent) ElMessage.success(`${getTitle(instance)} 已保存`)
    return true
  } catch (e) { console.error('保存 QQ 配置失败:', e); if (!silent) ElMessage.error('保存失败'); return false }
  finally { savingMap.value[instance.section] = false }
}

/* 启用开关快速切换（静默保存） */
function onOpenChange(instance) { saveInstance(instance, true) }

/* ================= 弹窗编辑 ================= */
function openEdit(inst) {
  dialogMode.value = 'edit'
  editingInstance.value = inst
  editForm.value = { ...inst }
  dialogVisible.value = true
}

async function saveEdit() {
  const inst = editingInstance.value
  if (!inst || !editForm.value) return
  // 启用状态以卡片头部开关为准，弹窗内不修改
  Object.assign(inst, { ...editForm.value, open: inst.open })
  const ok = await saveInstance(inst)
  if (ok) dialogVisible.value = false
}

/* ================= 添加实例弹窗 ================= */
function openAdd() {
  dialogMode.value = 'add'
  editingInstance.value = null
  editForm.value = {
    section: '', open: false,
    dic: 'private/bot/qq', path: 'qq-bot',
    appid: '', secret: '',
    at_compat: true, filter_slash: true,
    debug: false, ws: true, ws_intents: 0,
    remark: '', robot: '', connected: false,
  }
  dialogVisible.value = true
}

async function saveAdd() {
  if (!editForm.value) return
  if (!editForm.value.remark) return ElMessage.error('备注名不能为空')
  const dup = instances.value.find(i => i.remark === editForm.value.remark)
  if (dup) return ElMessage.error(`备注名 "${editForm.value.remark}" 已被使用`)
  adding.value = true
  try {
    // 先创建 section，再用弹窗表单值保存
    const data = await apiPost({ type: 'add_qq' })
    const section = data.section
    await apiPost({ type: 'save_qq', data: { section, config: {
        open: false, dic: editForm.value.dic, path: editForm.value.path, appid: editForm.value.appid,
        secret: editForm.value.secret, at_compat: editForm.value.at_compat, filter_slash: editForm.value.filter_slash, debug: editForm.value.debug, ws: editForm.value.ws,
        ws_intents: editForm.value.ws_intents, remark: editForm.value.remark, robot: editForm.value.robot,
      }}})
    instances.value.push({
      section, open: false,
      dic: editForm.value.dic || 'private/bot/qq', path: editForm.value.path || 'qq-bot',
      appid: editForm.value.appid || '', secret: editForm.value.secret || '',
      at_compat: editForm.value.at_compat, filter_slash: editForm.value.filter_slash,
      debug: editForm.value.debug, ws: editForm.value.ws,
      ws_intents: Number(editForm.value.ws_intents) || 0,
      remark: editForm.value.remark, robot: editForm.value.robot || '',
      connected: false,
    })
    ElMessage.success('新实例已添加')
    dialogVisible.value = false
  } catch (e) { console.error('添加 QQ 实例失败:', e); ElMessage.error('添加实例失败') }
  finally { adding.value = false }
}

async function saveDialog() {
  if (dialogMode.value === 'add') await saveAdd()
  else await saveEdit()
}

/* ================= 删除实例 ================= */
async function deleteInstance(instance, index) {
  try {
    await apiPost({ type: 'del_qq', data: { section: instance.section } })
    instances.value.splice(index, 1); ElMessage.success('已删除')
    // 全部删除后恢复默认主实例
    if (instances.value.length === 0) loadConfig()
  } catch (e) { console.error('删除 QQ 实例失败:', e); ElMessage.error('删除失败') }
}

// 启动/停止连接状态轮询（每 5 秒拉取一次 get_qq_list）
function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(refreshStatus, 5000)
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

onMounted(async () => {
  await loadConfig()
  startPolling()
})

onBeforeUnmount(() => {
  stopPolling()
})
</script>

<template>
  <div class="page">
    <!-- ========== 实例列表主视图 ========== -->
    <div class="page-view">
    <!-- ========== 页面头部 ========== -->
    <div class="page-header">
      <div class="header-row">
        <div class="title-line">
          <div class="header-text">
            <h2 class="page-title">QQ 官方机器人</h2>
            <p class="page-subtitle">对接 QQ 开放平台官方机器人，支持多实例 WebSocket 长连接</p>
          </div>
        </div>
        <div class="header-actions">
          <ElButton :icon="Refresh" circle :loading="loading" title="刷新状态" @click="loadConfig" />
          <ElButton type="primary" :icon="Plus" :disabled="loadFailed" @click="openAdd">
            添加实例
          </ElButton>
        </div>
      </div>
    </div>

    <!-- ========== 加载失败 ========== -->
    <div v-if="loadFailed" class="error-state">
      <el-icon class="error-icon"><WarningFilled /></el-icon>
      <span>配置加载失败，请检查后端服务是否正常运行</span>
    </div>

    <!-- ========== 实例列表 ========== -->
    <div v-else v-loading="loading" class="instance-list">
      <div
        v-for="(inst, idx) in instances"
        :key="inst.section"
        class="instance-card"
        :class="{ 'card-off': !inst.open }"
      >
        <!-- ===== 卡片头部 ===== -->
        <div class="card-header">
          <div class="inst-main">
            <ElAvatar v-if="inst.bot_name" :src="inst.bot_avatar" :size="36" class="bot-avatar" />
            <div class="inst-text">
              <div class="inst-name" :title="inst.bot_name || getTitle(inst)">{{ inst.bot_name || getTitle(inst) }}</div>
              <div class="inst-remark" :title="inst.remark || inst.section">{{ inst.remark || inst.section }}</div>
            </div>
          </div>

          <span class="conn-status" :class="connClass(inst)">
            <span class="conn-dot"></span>{{ connText(inst) }}
          </span>

          <div class="header-ops">
            <ElButton type="primary" size="small" plain :icon="Setting" @click="openEdit(inst)">
              编辑配置
            </ElButton>
            <ElButton size="small" plain :icon="ChatDotRound" @click="openSandbox(inst)">
              沙箱测试
            </ElButton>
            <ElPopconfirm title="确定删除该实例？" @confirm="deleteInstance(inst, idx)">
              <template #reference>
                <ElButton type="danger" size="small" text :icon="Delete" class="delete-btn" />
              </template>
            </ElPopconfirm>
            <ElSwitch
              v-model="inst.open"
              size="small"
              :disabled="loadFailed"
              title="启用/停用"
              @change="onOpenChange(inst)"
            />
          </div>
        </div>
      </div>
    </div>
    </div>

    

    <!-- ========== 编辑弹窗 ========== -->
    <ElDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      :width="isMobile ? '92%' : '680px'"
      :close-on-click-modal="false"
      destroy-on-close
      class="edit-dialog"
    >
      <ElForm
        v-if="editForm"
        :model="editForm"
        :label-position="isMobile ? 'top' : 'right'"
        size="default"
        class="cfg-form"
      >
        <!-- ===== 基础信息 ===== -->
        <div class="form-section">
          <div class="section-title">
            <el-icon><ChatDotRound /></el-icon>
            基础信息
          </div>
          <el-row :gutter="24">
            <el-col :span="24">
              <ElFormItem label="备注名">
                <ElInput v-model="editForm.remark" placeholder="用于区分多个实例" />
              </ElFormItem>
            </el-col>
          </el-row>
        </div>

        <!-- ===== 连接配置 ===== -->
        <div class="form-section">
          <div class="section-title">
            <el-icon><Link /></el-icon>
            连接配置
          </div>
          <el-row :gutter="24">
            <el-col :xs="24" :sm="12">
              <ElFormItem label="APPID">
                <div class="input-with-copy">
                  <ElInput v-model="editForm.appid" placeholder="请输入 APPID" />
                  <ElButton text :icon="CopyDocument" class="copy-btn" title="复制" @click="copyField(editForm.appid, 'APPID')" />
                </div>
              </ElFormItem>
            </el-col>
            <el-col :xs="24" :sm="12">
              <ElFormItem label="密钥">
                <div class="input-with-copy">
                  <ElInput v-model="editForm.secret" show-password placeholder="请输入密钥" />
                  <ElButton text :icon="CopyDocument" class="copy-btn" title="复制" @click="copyField(editForm.secret, '密钥')" />
                </div>
              </ElFormItem>
            </el-col>
            <el-col :xs="24" :sm="12">
              <ElFormItem label="词库">
                <ElInput v-model="editForm.dic" placeholder="例如 private/bot/qq" />
              </ElFormItem>
            </el-col>
            <el-col :xs="24" :sm="12">
              <ElFormItem label="访问路径">
                <ElInput v-model="editForm.path" placeholder="例如 qq-bot" />
              </ElFormItem>
            </el-col>
          </el-row>
        </div>

        <!-- ===== 高级设置 ===== -->
        <div class="form-section">
          <div class="section-title">
            <el-icon><Operation /></el-icon>
            高级设置
          </div>
          <el-row :gutter="24">
            <el-col :xs="24" :sm="12">
              <ElFormItem label="Robot 变量">
                <ElInput v-model="editForm.robot" placeholder="%robot%，union_openid 取不到时使用" />
              </ElFormItem>
            </el-col>
            <el-col :xs="24" :sm="12">
              <ElFormItem>
                <template #label>
                  <span class="label-with-tip">
                    监听码
                    <el-tooltip
                      content="WebSocket 意图订阅值。0 = 自动探测（先公域后私域）；可自定义意图码：公域默认 1073741825，私域默认 513"
                      placement="top"
                    >
                      <el-icon class="tip-icon"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </span>
                </template>
                <ElInput v-model.number="editForm.ws_intents" placeholder="0 = 自动探测公域/私域" />
              </ElFormItem>
            </el-col>
          </el-row>
        </div>

        <!-- ===== 功能开关 ===== -->
        <div class="form-section">
          <div class="section-title">
            <el-icon><SwitchButton /></el-icon>
            功能开关
          </div>
          <div class="switch-grid">
            <div class="switch-item">
              <div class="switch-label"><span>调试打印</span></div>
              <ElSwitch v-model="editForm.debug" size="small" />
            </div>
            <div class="switch-item">
              <div class="switch-label"><span>全量艾特兼容</span></div>
              <ElSwitch v-model="editForm.at_compat" size="small" />
            </div>
            <div class="switch-item">
              <div class="switch-label"><span>过滤空格斜杠</span></div>
              <ElSwitch v-model="editForm.filter_slash" size="small" />
            </div>
            <div class="switch-item">
              <div class="switch-label"><span>WebSocket</span></div>
              <ElSwitch v-model="editForm.ws" size="small" />
            </div>
          </div>
        </div>
      </ElForm>

      <template #footer>
        <ElButton @click="dialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="dialogSaving" @click="saveDialog">
          保存配置
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
}

/* ========== 页面头部 ========== */
.page-header {
  margin-bottom: 20px;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.title-line {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.page-title {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  letter-spacing: -0.3px;
}

.page-subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* ========== 错误状态 ========== */
.error-state {
  text-align: center;
  color: var(--el-color-danger);
  padding: 40px 20px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.error-icon {
  font-size: 32px;
}

/* ========== 实例列表 ========== */
.instance-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 120px;
}

/* ========== 卡片 ========== */
.instance-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 14px;
  overflow: hidden;
  transition: border-color 0.25s, box-shadow 0.25s;
}

.instance-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
}

.instance-card.card-off .card-header {
  opacity: 0.75;
}

/* ========== 卡片头部 ========== */
.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  flex-wrap: wrap;
}

.inst-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  min-width: 0;
  max-width: 280px;
}

.bot-avatar {
  flex-shrink: 0;
  box-shadow: 0 0 0 2px var(--el-bg-color), 0 0 0 3px var(--el-border-color-lighter);
}

.inst-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.inst-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inst-remark {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 连接状态 */
.conn-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.conn-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.conn-status.on {
  color: var(--el-color-success);
}

.conn-status.on .conn-dot {
  animation: conn-pulse 1.6s ease-in-out infinite;
}

.conn-status.warn {
  color: var(--el-color-warning);
}

.conn-status.off {
  color: var(--el-text-color-placeholder);
}

@keyframes conn-pulse {
  0% { box-shadow: 0 0 0 0 rgba(103, 194, 58, 0.45); }
  70% { box-shadow: 0 0 0 6px rgba(103, 194, 58, 0); }
  100% { box-shadow: 0 0 0 0 rgba(103, 194, 58, 0); }
}

.header-ops {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
  flex-shrink: 0;
}

.delete-btn {
  flex-shrink: 0;
}

/* ========== 弹窗表单 ========== */
.cfg-form :deep(.el-form-item) {
  margin-bottom: 16px;
}

.cfg-form :deep(.el-form-item__label) {
  width: 100px;
}

.edit-dialog :deep(.el-dialog__body) {
  max-height: 62vh;
  overflow-y: auto;
  padding-top: 8px;
}

.form-section + .form-section {
  margin-top: 16px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 12px;
}

.section-title .el-icon {
  color: var(--el-color-primary);
}

.input-with-copy {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.input-with-copy .el-input {
  flex: 1;
}

.copy-btn {
  flex-shrink: 0;
}

.label-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.tip-icon {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
  cursor: help;
}

/* 功能开关 */
.switch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 12px;
}

.switch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  transition: border-color 0.2s;
}

.switch-item:hover {
  border-color: var(--el-color-primary-light-5);
}

.switch-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

/* ========== 响应式 ========== */
@media (max-width: 768px) {
  .page-header {
    margin-bottom: 16px;
  }

  .page-title {
    font-size: 18px;
  }

  .page-subtitle {
    font-size: 13px;
  }

  .instance-list {
    gap: 10px;
  }

  .card-header {
    padding: 12px 14px;
    gap: 8px;
  }

  .switch-grid {
    grid-template-columns: 1fr;
  }

}

@media (max-width: 480px) {
  .page-title {
    font-size: 16px;
  }

  .page-subtitle {
    font-size: 12px;
  }

  .instance-card {
    border-radius: 10px;
  }

  .card-header {
    padding: 10px 12px;
  }

  .header-actions .el-button--primary {
    padding: 0 12px;
  }

  /* 卡片头部：名称/状态一行，操作按钮换行均分 */
  .inst-main {
    max-width: 100%;
  }

  .header-ops {
    width: 100%;
    margin-left: 0;
    flex-wrap: wrap;
  }

  .header-ops .el-button:not(.delete-btn) {
    flex: 1;
    margin-left: 0;
  }
}
</style>
