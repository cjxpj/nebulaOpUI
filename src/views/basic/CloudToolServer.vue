<script setup>
import { ref, onMounted, h } from 'vue'
import { ElCheckbox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

/* ================= 移动端适配 ================= */
const { isMobile } = useMobile()

/* ================= 表单数据 ================= */
const form = ref({
  open: false,
  addr: 'cloudtool',
  allow_register: false,
  dic_dir: 'cloudtool',
  logout_sec: 30,
  debug: false,
})

const loading = ref(false)
const saving = ref(false)
const loadFailed = ref(false)

/* ================= 初始化加载 ================= */
async function loadConfig() {
  loading.value = true
  loadFailed.value = false

  try {
    const data = await apiPost({ type: 'get_cloudtool_server' })

    form.value.open = Boolean(data.open)
    form.value.addr = data.addr || 'cloudtool'
    form.value.allow_register = Boolean(data.allow_register)
    form.value.dic_dir = data.dic_dir || 'cloudtool'
    form.value.logout_sec = data.logout_sec != null ? data.logout_sec : 30
    form.value.debug = Boolean(data.debug)
  } catch (e) {
    console.error('获取云工具服务端配置失败:', e)
    loadFailed.value = true
    ElMessage.error('获取云工具服务端配置失败')
  } finally {
    loading.value = false
  }
}

/* ================= 保存配置 ================= */
async function saveConfig(silent) {
  if (loadFailed.value) return

  if (!form.value.addr.trim()) {
    ElMessage.error('访问路径不能为空')
    return
  }
  if (!form.value.dic_dir.trim()) {
    ElMessage.error('词库目录不能为空')
    return
  }

  saving.value = true
  try {
    await apiPost({
      type: 'save_cloudtool_server',
      data: {
        open: form.value.open,
        addr: form.value.addr.trim(),
        allow_register: form.value.allow_register,
        dic_dir: form.value.dic_dir.trim(),
        logout_sec: form.value.logout_sec,
        debug: form.value.debug,
      },
    })

    if (!silent) {
      ElMessage.success('云工具服务端配置已保存')
    }
    return true
  } catch (e) {
    console.error('保存云工具服务端配置失败:', e)
    ElMessage.error('保存配置失败')
    return false
  } finally {
    saving.value = false
  }
}

/* ================= 实时开关 ================= */
function onToggleOpen() {
  if (loadFailed.value) return
  saveConfig(true)
  ElMessage.success(form.value.open ? '云工具服务端已开启' : '云工具服务端已关闭')
}

/* ================= 配置弹窗 ================= */
const dialogVisible = ref(false)

function openDialog() {
  if (loadFailed.value) return
  dialogVisible.value = true
}

async function saveFromDialog() {
  const ok = await saveConfig(false)
  if (ok) dialogVisible.value = false
}

/* ================= 账号管理 ================= */
const accounts = ref([])
const loadingAccounts = ref(false)
const keyword = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)

async function loadAccounts() {
  loadingAccounts.value = true
  try {
    const data = await apiPost({
      type: 'get_cloudtool_accounts',
      data: { page: page.value, page_size: pageSize.value, keyword: keyword.value.trim() },
    })
    accounts.value = Array.isArray(data.items) ? data.items : []
    total.value = data.total || 0
  } catch (e) {
    console.error('获取云工具账号列表失败:', e)
    accounts.value = []
    total.value = 0
  } finally {
    loadingAccounts.value = false
  }
}

// 搜索时回到第一页
function onSearch() {
  page.value = 1
  loadAccounts()
}

function onPageChange(p) {
  page.value = p
  loadAccounts()
}

// 累计在线时长格式化
function formatDuration(sec) {
  if (!sec) return '0 秒'
  if (sec < 60) return `${sec} 秒`
  if (sec < 3600) return `${Math.floor(sec / 60)} 分 ${sec % 60} 秒`
  if (sec < 86400) return `${Math.floor(sec / 3600)} 时 ${Math.floor((sec % 3600) / 60)} 分`
  return `${Math.floor(sec / 86400)} 天 ${Math.floor((sec % 86400) / 3600)} 时`
}

// 注册时间格式化
function formatTime(ts) {
  if (!ts) return '-'
  const d = new Date(ts * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function disconnectAccount(row) {
  try {
    await apiPost({ type: 'disconnect_cloudtool_account', data: { username: row.username } })
    ElMessage.success(`已断开「${row.username}」`)
    loadAccounts()
  } catch (e) {
    console.error('断开云工具账号失败:', e)
    ElMessage.error('断开失败')
  }
}

// 点击白名单开关切换：在白名单 → 移出，不在 → 加入
async function toggleWhitelist(row) {
  try {
    const data = await apiPost({
      type: row.whitelisted ? 'remove_cloudtool_whitelist' : 'add_cloudtool_whitelist',
      data: { username: row.username },
    })
    ElMessage.success(data.whitelisted ? `已将「${row.username}」加入白名单` : `已将「${row.username}」移出白名单`)
    loadAccounts()
    loadWhitelist() // 同步白名单配置页签
  } catch (e) {
    console.error('更新白名单失败:', e)
    ElMessage.error('更新白名单失败')
  }
}

async function deleteAccount(row) {
  let delBalance = true
  const msg = h('div', null, [
    h('p', { style: 'margin: 0 0 12px;' }, `确定删除账号「${row.username}」？删除后该账号将无法登录，且不可恢复。`),
    h(ElCheckbox, {
      modelValue: delBalance,
      'onUpdate:modelValue': (v) => { delBalance = v },
    }, { default: () => '同时删除云工具余额' }),
  ])
  try {
    await ElMessageBox.confirm(msg, '删除账号', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch (e) {
    return
  }
  try {
    await apiPost({ type: 'delete_cloudtool_account', data: { username: row.username, delete_balance: delBalance } })
    ElMessage.success(delBalance ? `已删除「${row.username}」及云工具余额` : `已删除「${row.username}」`)
    loadAccounts()
  } catch (e) {
    console.error('删除云工具账号失败:', e)
    ElMessage.error('删除失败')
  }
}

/* ================= 重置密码 ================= */
const resetVisible = ref(false)
const resetForm = ref({ username: '', password: '', confirm: '' })
const loadingReset = ref(false)

function openResetPwd(row) {
  resetForm.value = { username: row.username, password: '', confirm: '' }
  resetVisible.value = true
}

async function submitResetPwd() {
  const pwd = resetForm.value.password
  if (!pwd) {
    ElMessage.warning('请输入新密码')
    return
  }
  if (pwd.length < 3 || pwd.length > 64) {
    ElMessage.warning('密码长度需为 3~64 位')
    return
  }
  if (pwd !== resetForm.value.confirm) {
    ElMessage.error('两次输入的密码不一致')
    return
  }
  loadingReset.value = true
  try {
    await apiPost({ type: 'reset_cloudtool_password', data: { username: resetForm.value.username, new_password: pwd } })
    ElMessage.success(`已重置「${resetForm.value.username}」的密码`)
    resetVisible.value = false
    loadAccounts()
  } catch (e) {
    console.error('重置密码失败:', e)
    ElMessage.error(e.message || '重置失败')
  } finally {
    loadingReset.value = false
  }
}

/* ================= 清空全部账号 ================= */
async function clearAccounts() {
  try {
    await ElMessageBox.confirm(
      '确定清空全部账号？白名单内的账号将被保留，其余账号（含登录 token、在线连接与云工具余额）将全部删除，此操作不可恢复。',
      '清空全部账号',
      { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' },
    )
  } catch (e) {
    return
  }
  try {
    const data = await apiPost({ type: 'clear_cloudtool_accounts' })
    ElMessage.success(data.kept ? `已清空 ${data.deleted} 个账号，白名单保留 ${data.kept} 个` : `已清空全部 ${data.deleted} 个账号`)
    page.value = 1
    loadAccounts()
  } catch (e) {
    console.error('清空云工具账号失败:', e)
    ElMessage.error('清空失败')
  }
}

/* ================= 白名单配置 ================= */
const activeTab = ref('accounts')
const whitelist = ref([])
const loadingWl = ref(false)
const wlKeyword = ref('')
const wlAddVisible = ref(false)
const wlAddName = ref('')
const loadingWlAdd = ref(false)
const wlPage = ref(1)
const wlPageSize = ref(10)
const wlTotal = ref(0)

async function loadWhitelist() {
  loadingWl.value = true
  try {
    const data = await apiPost({
      type: 'get_cloudtool_whitelist',
      data: { page: wlPage.value, page_size: wlPageSize.value, keyword: wlKeyword.value.trim() },
    })
    whitelist.value = (Array.isArray(data.items) ? data.items : []).map((name) => ({ username: name }))
    wlTotal.value = data.total || 0
  } catch (e) {
    console.error('获取白名单失败:', e)
    whitelist.value = []
    wlTotal.value = 0
  } finally {
    loadingWl.value = false
  }
}

function onWlSearch() {
  wlPage.value = 1
  loadWhitelist()
}

function onWlPageChange(p) {
  wlPage.value = p
  loadWhitelist()
}

// 账号格式：1~32 位，允许任意语言文字/数字及 _ - . @（与后端校验一致）
const CLOUD_USERNAME_RE = /^[\p{L}\p{N}_\-.@]{1,32}$/u
const CLOUD_USERNAME_RULE = '账号格式不合法：仅支持字母、数字及 _ - . @，长度 1~32 位'

function validCloudUsername(name) {
  return CLOUD_USERNAME_RE.test(name)
}

// 打开添加白名单弹窗
function openWlAdd() {
  wlAddName.value = ''
  wlAddVisible.value = true
}

async function submitWlAdd() {
  const name = wlAddName.value.trim()
  if (!name) {
    ElMessage.warning('请输入要加入白名单的账号')
    return
  }
  if (!validCloudUsername(name)) {
    ElMessage.error(CLOUD_USERNAME_RULE)
    return
  }
  loadingWlAdd.value = true
  try {
    const data = await apiPost({ type: 'add_cloudtool_whitelist', data: { username: name } })
    ElMessage.success(data.whitelisted ? `已将「${name}」加入白名单` : `「${name}」已在白名单中`)
    wlAddVisible.value = false
    onWlSearch()
    loadAccounts()
  } catch (e) {
    console.error('添加白名单失败:', e)
    ElMessage.error('添加失败')
  } finally {
    loadingWlAdd.value = false
  }
}

async function removeWl(row) {
  try {
    const data = await apiPost({ type: 'remove_cloudtool_whitelist', data: { username: row.username } })
    if (!data.whitelisted) {
      ElMessage.success(`已将「${row.username}」移出白名单`)
    }
    onWlSearch()
    loadAccounts()
  } catch (e) {
    console.error('移出白名单失败:', e)
    ElMessage.error('移出失败')
  }
}

/* ================= 编辑账号（重命名） ================= */
const editVisible = ref(false)
const editForm = ref({ username: '', newName: '' })

function openEditAccount(row) {
  editForm.value = { username: row.username, newName: '' }
  editVisible.value = true
}

async function saveEditAccount() {
  const newName = editForm.value.newName.trim()
  if (!newName) {
    ElMessage.warning('请输入新账号名')
    return
  }
  if (!validCloudUsername(newName)) {
    ElMessage.error(CLOUD_USERNAME_RULE)
    return
  }
  if (newName === editForm.value.username) {
    editVisible.value = false
    return
  }
  try {
    await apiPost({ type: 'rename_cloudtool_account', data: { username: editForm.value.username, new_name: newName } })
    ElMessage.success(`已将「${editForm.value.username}」重命名为「${newName}」`)
    editVisible.value = false
    onSearch()
    loadWhitelist() // 白名单配置页签实时同步（后端已迁移白名单）
  } catch (e) {
    console.error('重命名账号失败:', e)
    ElMessage.error(e.message || '重命名失败')
  }
}

onMounted(() => {
  loadConfig()
  loadAccounts()
  loadWhitelist()
})
</script>

<template>
  <div class="page">
    <!-- 服务状态概览 -->
    <div class="status-card" :class="form.open ? 'is-on' : 'is-off'">
      <div class="status-main">
        <span class="status-dot"></span>
        <div class="status-info">
          <div class="status-title">{{ form.open ? '服务运行中' : '服务已停止' }}</div>
        </div>
      </div>
      <div class="status-switch">
        <ElButton type="primary" plain :disabled="loadFailed" @click="openDialog">设置</ElButton>
        <ElSwitch
          v-model="form.open"
          :disabled="loadFailed"
          inline-prompt
          active-text="开"
          inactive-text="关"
          @change="onToggleOpen"
        />
      </div>
    </div>

    <!-- 页签：账号管理 / 白名单配置 -->
    <ElTabs v-model="activeTab" class="page-tabs">
      <!-- 账号管理 -->
      <ElTabPane label="账号管理" name="accounts">
        <div class="account-section">
          <div class="section-head">
            <h3 class="section-title">账号管理</h3>
            <div class="section-tools">
              <ElInput
                v-model="keyword"
                class="account-search"
                placeholder="搜索账号"
                clearable
                size="small"
                :prefix-icon="Search"
                @keyup.enter="onSearch"
                @clear="onSearch"
              />
              <ElButton size="small" :disabled="loadFailed" :loading="loadingAccounts" @click="loadAccounts">刷新</ElButton>
              <ElButton size="small" type="danger" plain :disabled="loadFailed" @click="clearAccounts">清空全部账号</ElButton>
            </div>
          </div>
          <ElTable
            :data="accounts"
            v-loading="loadingAccounts"
            empty-text="暂无账号"
          >
            <ElTableColumn label="账号" min-width="210">
              <template #default="{ row }">
                <div class="account-cell">
                  <ElSwitch
                    :model-value="row.whitelisted"
                    size="small"
                    inline-prompt
                    active-text="白名单"
                    inactive-text="非白名单"
                    :active-color="'var(--el-color-warning)'"
                    :disabled="loadFailed"
                    :title="row.whitelisted ? '点击移出白名单' : '点击加入白名单'"
                    @change="toggleWhitelist(row)"
                  />
                  <span class="account-name" :title="'点击编辑账号「' + row.username + '」'" @click="openEditAccount(row)">
                    {{ row.username }}
                  </span>
                </div>
              </template>
            </ElTableColumn>
            <ElTableColumn label="状态" width="130">
              <template #default="{ row }">
                <ElSwitch
                  :model-value="row.online"
                  size="small"
                  inline-prompt
                  active-text="在线"
                  inactive-text="离线"
                  :disabled="!row.online || loadFailed"
                  :title="row.online ? (row.conn_count > 1 ? '在线连接 ×' + row.conn_count + '，点击断开' : '点击断开连接') : ''"
                  @change="disconnectAccount(row)"
                />
              </template>
            </ElTableColumn>
            <ElTableColumn label="余额" width="130">
              <template #default="{ row }">{{ row.balance }}</template>
            </ElTableColumn>
            <ElTableColumn label="累计在线时长" width="150">
              <template #default="{ row }">{{ formatDuration(row.online_seconds) }}</template>
            </ElTableColumn>
            <ElTableColumn label="注册时间" width="160">
              <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
            </ElTableColumn>
            <ElTableColumn label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <ElButton link type="primary" :disabled="loadFailed" @click="openResetPwd(row)">重置密码</ElButton>
                <ElButton link type="danger" :disabled="loadFailed" @click="deleteAccount(row)">删除</ElButton>
              </template>
            </ElTableColumn>
          </ElTable>
          <div v-if="total > pageSize" class="account-pager">
            <ElPagination
              layout="total, prev, pager, next"
              :total="total"
              :page-size="pageSize"
              :current-page="page"
              @current-change="onPageChange"
            />
          </div>
        </div>
      </ElTabPane>

      <!-- 白名单配置 -->
      <ElTabPane label="白名单配置" name="whitelist">
        <div class="whitelist-section">
          <div class="section-head">
            <h3 class="section-title">白名单配置</h3>
            <div class="section-tools">
              <ElInput
                v-model="wlKeyword"
                class="account-search"
                placeholder="搜索账号"
                clearable
                size="small"
                :prefix-icon="Search"
                @keyup.enter="onWlSearch"
                @clear="onWlSearch"
              />
              <ElButton size="small" type="primary" :disabled="loadFailed" @click="openWlAdd">添加</ElButton>
              <ElButton size="small" :disabled="loadFailed" :loading="loadingWl" @click="loadWhitelist">刷新</ElButton>
            </div>
          </div>
          <ElTable :data="whitelist" v-loading="loadingWl" empty-text="暂无白名单账号">
            <ElTableColumn prop="username" label="账号" min-width="140" />
            <ElTableColumn label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <ElButton link type="danger" :disabled="loadFailed" @click="removeWl(row)">移出</ElButton>
              </template>
            </ElTableColumn>
          </ElTable>
          <div v-if="wlTotal > wlPageSize" class="account-pager">
            <ElPagination
              layout="total, prev, pager, next"
              :total="wlTotal"
              :page-size="wlPageSize"
              :current-page="wlPage"
              @current-change="onWlPageChange"
            />
          </div>
        </div>
      </ElTabPane>
    </ElTabs>

    <!-- 添加白名单账号弹窗 -->
    <ElDialog
      v-model="wlAddVisible"
      title="添加白名单账号"
      :width="isMobile ? '92%' : '420px'"
      append-to-body
    >
      <ElForm :label-position="isMobile ? 'top' : 'right'" :label-width="isMobile ? undefined : '70px'" @submit.prevent>
        <ElFormItem label="账号">
          <ElInput
            v-model="wlAddName"
            placeholder="输入要加入白名单的账号"
            maxlength="32"
            clearable
            @keyup.enter="submitWlAdd"
          />
        </ElFormItem>
        <div class="form-hint" style="padding-left: 0;">仅支持字母、数字及 _ - . @，长度 1~32 位</div>
      </ElForm>
      <template #footer>
        <ElButton @click="wlAddVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="loadingWlAdd" @click="submitWlAdd">添加</ElButton>
      </template>
    </ElDialog>

    <!-- 重置密码弹窗 -->
    <ElDialog
      v-model="resetVisible"
      title="重置密码"
      :width="isMobile ? '92%' : '420px'"
      append-to-body
    >
      <ElForm :label-position="isMobile ? 'top' : 'right'" :label-width="isMobile ? undefined : '70px'">
        <ElFormItem label="账号">
          <ElInput :model-value="resetForm.username" disabled />
        </ElFormItem>
        <ElFormItem label="新密码">
          <ElInput
            v-model="resetForm.password"
            type="password"
            show-password
            placeholder="3~64 位"
            @keyup.enter="submitResetPwd"
          />
        </ElFormItem>
        <ElFormItem label="确认密码">
          <ElInput
            v-model="resetForm.confirm"
            type="password"
            show-password
            placeholder="再次输入新密码"
            @keyup.enter="submitResetPwd"
          />
        </ElFormItem>
        <div class="form-hint" style="padding-left: 0;">重置后该账号在线连接将断开，需用新密码重新登录</div>
      </ElForm>
      <template #footer>
        <ElButton @click="resetVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="loadingReset" @click="submitResetPwd">确定</ElButton>
      </template>
    </ElDialog>

    <!-- 服务端配置弹窗 -->
    <ElDialog
      v-model="dialogVisible"
      title="服务端配置"
      :width="isMobile ? '92%' : '600px'"
      append-to-body
    >
      <ElForm
        :model="form"
        v-loading="loading"
        :label-position="isMobile ? 'top' : 'right'"
        :label-width="isMobile ? undefined : '130px'"
      >
        <h4 class="dialog-section-title">连接设置</h4>
        <ElFormItem label="访问路径">
          <ElInput
            v-model="form.addr"
            placeholder="cloudtool"
            :disabled="loadFailed"
          >
            <template #prepend>/</template>
          </ElInput>
          <div class="form-hint">客户端连接 ws://host:port/{访问路径}/{账号}</div>
        </ElFormItem>

        <ElFormItem label="词库目录">
          <ElInput
            v-model="form.dic_dir"
            placeholder="cloudtool"
            :disabled="loadFailed"
          >
            <template #prepend>private/</template>
          </ElInput>
          <div class="form-hint">该目录下所有 .n 文件都会作为云函数加载</div>
        </ElFormItem>

        <ElFormItem label="断开注销时长">
          <div class="inline-row">
            <ElInputNumber
              v-model="form.logout_sec"
              :min="0"
              :max="86400"
              :disabled="loadFailed"
              controls-position="right"
              style="width: 160px"
            />
            <span class="unit">秒</span>
          </div>
          <div class="form-hint">断开时本次在线时长低于该值自动注销，0 表示关闭</div>
        </ElFormItem>

        <h4 class="dialog-section-title">账号与访问控制</h4>
        <ElFormItem label="任意账号注册">
          <ElSwitch
            v-model="form.allow_register"
            :disabled="loadFailed"
            inline-prompt
            active-text="开启"
            inactive-text="关闭"
          />
          <div class="form-hint">新账号首次登录自动注册；关闭时仅白名单账号可登录</div>
        </ElFormItem>

        <h4 class="dialog-section-title">调试</h4>
        <ElFormItem label="调试日志">
          <ElSwitch
            v-model="form.debug"
            :disabled="loadFailed"
            inline-prompt
            active-text="开启"
            inactive-text="关闭"
          />
          <div class="form-hint">开启后打印云工具连接与消息日志</div>
        </ElFormItem>
      </ElForm>

      <template #footer>
        <ElButton :disabled="loadFailed" @click="dialogVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" :disabled="loadFailed" @click="saveFromDialog">保存配置</ElButton>
      </template>
    </ElDialog>

    <!-- 编辑账号弹窗（重命名） -->
    <ElDialog
      v-model="editVisible"
      title="编辑账号"
      :width="isMobile ? '92%' : '420px'"
      append-to-body
    >
      <ElForm
        :model="editForm"
        :label-position="isMobile ? 'top' : 'right'"
        :label-width="isMobile ? undefined : '90px'"
      >
        <ElFormItem label="原账号">
          <ElInput :model-value="editForm.username" disabled />
        </ElFormItem>
        <ElFormItem label="新账号名">
          <ElInput
            v-model="editForm.newName"
            placeholder="输入新账号名"
            maxlength="64"
            @keyup.enter="saveEditAccount"
          />
        </ElFormItem>
      </ElForm>
      <div class="form-hint">重命名后在线连接将被断开，需用新账号重新登录；若该账号在白名单内会自动迁移</div>
      <template #footer>
        <ElButton @click="editVisible = false">取消</ElButton>
        <ElButton type="primary" @click="saveEditAccount">保存</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
}

.page-header {
  margin-bottom: 24px;
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

.panel-card {
  padding: 28px 32px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  transition: border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.panel-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

/* ================= 服务状态概览 ================= */
.status-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.status-main {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.status-dot {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--el-text-color-placeholder);
}

.status-card.is-on .status-dot {
  background: var(--el-color-success);
  box-shadow: 0 0 0 4px var(--el-color-success-light-8);
}

.status-info {
  min-width: 0;
}

.status-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.status-desc {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.status-desc code {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--el-fill-color);
  font-size: 12px;
  word-break: break-all;
}

.status-switch {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

/* ================= 分组卡片 ================= */
.section-title {
  margin: 0 0 18px;
  padding-bottom: 12px;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

/* 带操作按钮的分组标题行（如账号管理） */
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.section-head .section-title {
  margin: 0;
  padding: 0;
  border-bottom: none;
}

/* 账号管理（无卡片包裹） */
.account-section {
  margin-bottom: 20px;
}

.section-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.account-search {
  width: 200px;
}

.page-tabs {
  margin-bottom: 20px;
}

.account-pager {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

/* 账号单元格：白名单开关 + 可点击账号名 */
.account-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.account-name {
  color: var(--el-color-primary);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-name:hover {
  text-decoration: underline;
}

.panel-card + .panel-card {
  margin-top: 20px;
}

/* ================= 配置弹窗 ================= */
.dialog-section-title {
  margin: 4px 0 12px;
  padding-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-color-primary);
  border-bottom: 1px dashed var(--el-border-color-lighter);
}

.form-hint {
  margin-top: 4px;
  flex-basis: 100%;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.inline-row {
  display: flex;
  align-items: center;
}

.unit {
  margin-left: 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

@media (max-width: 768px) {
  .panel-card {
    padding: 20px 16px;
  }

  .page-title {
    font-size: 18px;
  }
}

@media (max-width: 480px) {
  .panel-card {
    padding: 16px 12px;
    border-radius: 8px;
  }

  .page-header {
    margin-bottom: 16px;
  }

  .page-title {
    font-size: 16px;
  }

  .page-subtitle {
    font-size: 12px;
  }

  .status-card {
    flex-direction: column;
    align-items: flex-start;
  }

  .status-switch {
    flex-wrap: wrap;
  }

  .section-head {
    flex-wrap: wrap;
  }

  .account-search {
    width: 100%;
  }

  .account-pager {
    justify-content: center;
  }
}
</style>
