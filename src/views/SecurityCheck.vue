<template>
  <div class="page">
    <div class="page-header">
      <div class="header-left">
        <h2 class="page-title">安全中心</h2>
        <p v-if="!isMobile" class="page-subtitle">登录提示与在线服务监控</p>
      </div>
      <ElButton :icon="Refresh" @click="loadAll" :loading="loading">
        刷新
      </ElButton>
    </div>

    <!-- 运行信息 -->
    <ElCard class="section-card" shadow="hover">
      <template #header>
        <div class="card-title">
          <ElIcon><Clock /></ElIcon>
          <span>运行信息</span>
        </div>
      </template>
      <div class="info-row">
        <span class="info-label">服务启动时间</span>
        <span class="info-value">{{ info.server_start || '-' }}</span>
      </div>
      <div class="info-row">
        <span class="info-label">已运行</span>
        <span class="info-value">{{ info.uptime || '-' }}</span>
      </div>
    </ElCard>

    <!-- 登陆提示 -->
    <ElCard class="section-card" shadow="hover">
      <template #header>
        <div class="card-title">
          <ElIcon><Warning /></ElIcon>
          <span>登陆提示</span>
          <ElTag v-if="info.login_events && info.login_events.length" size="small" type="info" style="margin-left:8px">
            {{ info.login_events.length }}
          </ElTag>
        </div>
      </template>
      <ElEmpty v-if="!info.login_events || info.login_events.length === 0" description="暂无登录记录" />
      <ElTimeline v-else>
        <ElTimelineItem
          v-for="(evt, idx) in displayEvents"
          :key="idx"
          :timestamp="evt.time"
          :type="evt.type === 'admin_login_fail' ? 'danger' : 'primary'"
          placement="top"
        >
          <div class="event-item">
            <span :class="['event-badge', evt.type === 'admin_login_fail' ? 'badge-danger' : 'badge-primary']">
              {{ evt.type === 'admin_login' ? '登录成功' : evt.type === 'admin_login_fail' ? '登录失败' : evt.type }}
            </span>
            <span class="event-detail">{{ evt.detail }}</span>
          </div>
          <div class="event-ip" v-if="evt.ip">IP: {{ evt.ip }}</div>
        </ElTimelineItem>
      </ElTimeline>
      <div v-if="totalEventPages > 1" class="events-pager">
        <ElButton :disabled="eventPage <= 1" size="small" @click="eventPage--">
          <ElIcon><ArrowLeft /></ElIcon>
        </ElButton>
        <span class="pager-info">{{ eventPage }} / {{ totalEventPages }}</span>
        <ElButton :disabled="eventPage >= totalEventPages" size="small" @click="eventPage++">
          <ElIcon><ArrowRight /></ElIcon>
        </ElButton>
      </div>
    </ElCard>

    <!-- 当前在线列表 -->
    <ElCard class="section-card" shadow="hover">
      <template #header>
        <div class="card-title">
          <ElIcon><Connection /></ElIcon>
          <span>当前在线列表</span>
          <ElTag v-if="info.online_list && info.online_list.length" size="small" type="success" style="margin-left:8px">
            {{ info.online_list.length }} 人在线
          </ElTag>
        </div>
      </template>
      <ElEmpty v-if="!info.online_list || info.online_list.length === 0" description="暂无在线用户" />
      <div v-else class="online-grid">
        <div
          v-for="(item, idx) in info.online_list"
          :key="idx"
          class="online-item"
        >
          <div class="online-dot active"></div>
          <div class="online-info">
            <div class="online-name">
              {{ item.name }}
              <ElTag type="warning" size="small">OPUI</ElTag>
            </div>
            <div class="online-detail">{{ item.detail }}</div>
          </div>
          <ElTag type="success" size="small" effect="dark">在线</ElTag>
        </div>
      </div>
    </ElCard>

    <!-- IP 黑名单 -->
    <ElCard class="section-card" shadow="hover">
      <template #header>
        <div class="card-title">
          <ElIcon><CircleClose /></ElIcon>
          <span>IP 黑名单</span>
          <ElTag v-if="blacklist.length" size="small" type="danger" style="margin-left:8px">
            {{ blacklist.length }}
          </ElTag>
        </div>
      </template>
      <div class="blacklist-add">
        <ElInput
          v-model="newIp"
          placeholder="输入 IP 地址，如 192.168.1.1"
          :size="isMobile ? 'small' : 'default'"
          @keyup.enter="addBlacklist"
        />
        <ElButton type="primary" :icon="Plus" @click="addBlacklist" :size="isMobile ? 'small' : 'default'">
          添加
        </ElButton>
      </div>
      <ElEmpty v-if="blacklist.length === 0" description="暂无黑名单 IP" :image-size="60" />
      <div v-else class="blacklist-items">
        <div v-for="ip in blacklist" :key="ip" class="blacklist-item">
          <span class="blacklist-ip">{{ ip }}</span>
          <ElPopconfirm title="确定移除此 IP？" @confirm="removeBlacklist(ip)">
            <template #reference>
              <ElButton type="danger" :icon="Delete" circle size="small" />
            </template>
          </ElPopconfirm>
        </div>
      </div>
    </ElCard>

    <!-- 访问防火墙 -->
    <ElCard class="section-card" shadow="hover">
      <template #header>
        <div class="card-title">
          <ElIcon><Lock /></ElIcon>
          <span>访问防火墙</span>
        </div>
      </template>
      <div class="firewall-config">
        <div class="fw-row">
          <span class="fw-label">启用状态</span>
          <ElSwitch v-model="firewallEnabled" @change="saveFirewallConfig" />
        </div>
        <div class="fw-row">
          <span class="fw-label">词库路径</span>
          <ElInput
            v-model="firewallDicPath"
            placeholder="如 private/system/firewall.n"
            :size="isMobile ? 'small' : 'default'"
            @blur="saveFirewallConfig"
          />
        </div>
        <div class="fw-tip">
          词库中将收到以下变量：%IP%、%路径%、%方法%、%UA%、%请求头%<br/>
          触发词为 <b>检查</b>，返回空或"放行"则通过，否则拦截并显示返回值。
        </div>
      </div>
    </ElCard>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  ElCard,
  ElButton,
  ElIcon,
  ElTag,
  ElTimeline,
  ElTimelineItem,
  ElEmpty,
  ElInput,
  ElSwitch,
  ElPopconfirm,
  ElMessage,
} from 'element-plus'
import {
  Refresh,
  Clock,
  Warning,
  Connection,
  CircleClose,
  Plus,
  Delete,
  Lock,
  ArrowLeft,
  ArrowRight,
} from '@element-plus/icons-vue'
import { apiPost, onPush } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

const { isMobile } = useMobile()

const loading = ref(false)
const info = ref({
  server_start: '',
  uptime: '',
  login_events: [],
  online_list: [],
})

// 登录事件分页
const PAGE_SIZE = 5
const eventPage = ref(1)
const totalEventPages = computed(() => Math.ceil(info.value.login_events.length / PAGE_SIZE))
const displayEvents = computed(() => {
  const start = (eventPage.value - 1) * PAGE_SIZE
  return info.value.login_events.slice(start, start + PAGE_SIZE)
})

async function loadData() {
  try {
    const data = await apiPost({ type: 'security_info' })
    if (data) {
      info.value = data
    }
  } catch (e) {
    console.error('安全中心数据加载失败:', e)
  }
}

/* ================= IP 黑名单 ================= */
const blacklist = ref([])
const newIp = ref('')

async function loadBlacklist() {
  try {
    const data = await apiPost({ type: 'ip_blacklist_list' })
    if (Array.isArray(data)) {
      blacklist.value = data
    }
  } catch (e) {
    console.error('加载黑名单失败:', e)
  }
}

async function addBlacklist() {
  const ip = newIp.value.trim()
  if (!ip) return
  try {
    await apiPost({ type: 'ip_blacklist_add', data: { ip } }, { noRetry: true })
    blacklist.value.push(ip)
    newIp.value = ''
    ElMessage.success(`已添加 ${ip} 到黑名单`)
  } catch (e) {
    ElMessage.error('添加失败')
  }
}

async function removeBlacklist(ip) {
  try {
    await apiPost({ type: 'ip_blacklist_remove', data: { ip } }, { noRetry: true })
    blacklist.value = blacklist.value.filter(b => b !== ip)
    ElMessage.success(`已移除 ${ip}`)
  } catch (e) {
    ElMessage.error('移除失败')
  }
}

/* ================= 访问防火墙 ================= */
const firewallEnabled = ref(false)
const firewallDicPath = ref('')

async function loadFirewallConfig() {
  try {
    const data = await apiPost({ type: 'firewall_get_config' })
    if (data) {
      firewallEnabled.value = data.enabled || false
      firewallDicPath.value = data.dic_path || ''
    }
  } catch (e) {
    console.error('加载防火墙配置失败:', e)
  }
}

async function saveFirewallConfig() {
  try {
    await apiPost({
      type: 'firewall_save_config',
      data: { enabled: firewallEnabled.value, dic_path: firewallDicPath.value },
    }, { noRetry: true })
    ElMessage.success('防火墙配置已保存')
  } catch (e) {
    ElMessage.error('保存失败')
  }
}

/* ================= 初始化 ================= */
async function loadAll() {
  loading.value = true
  try {
    await Promise.all([loadData(), loadBlacklist(), loadFirewallConfig()])
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

// 实时刷新在线列表
let unsubOnline = null

onMounted(() => {
  loadAll()
  unsubOnline = onPush((data) => {
    if (data.type === 'online_update') {
      loadData()
    }
  })
})

onUnmounted(() => {
  if (unsubOnline) unsubOnline()
})
</script>

<style scoped>
.page {
  padding: 4px 8px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 8px;
}

.header-left {
  display: flex;
  flex-direction: column;
}

.page-title {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 600;
}

.page-subtitle {
  margin: 2px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 0.85rem;
}

/* section 卡片 */
.section-card {
  margin-bottom: 16px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 1rem;
}

/* 运行信息 */
.info-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
}

.info-row + .info-row {
  border-top: 1px solid var(--el-border-color-lighter);
  margin-top: 4px;
  padding-top: 10px;
}

.info-label {
  color: var(--el-text-color-secondary);
  min-width: 90px;
}

.info-value {
  font-weight: 500;
}

/* 登陆事件 */
.event-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.event-badge {
  font-size: 0.75rem;
  padding: 1px 8px;
  border-radius: 4px;
  font-weight: 500;
  white-space: nowrap;
}

.badge-primary {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.badge-danger {
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}

.event-detail {
  color: var(--el-text-color-regular);
}

.event-ip {
  font-size: 0.8rem;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.events-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 8px;
}

.pager-info {
  font-size: 0.85rem;
  color: var(--el-text-color-secondary);
  min-width: 60px;
  text-align: center;
}

/* 在线列表 */
.online-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.online-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}

.online-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--el-color-danger);
}

.online-dot.active {
  background: var(--el-color-success);
  box-shadow: 0 0 6px var(--el-color-success);
}

.online-info {
  flex: 1;
  min-width: 0;
}

.online-name {
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.online-detail {
  font-size: 0.8rem;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

/* IP 黑名单 */
.blacklist-add {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.blacklist-add .el-input {
  flex: 1;
}

.blacklist-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.blacklist-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--el-color-danger-light-9);
}

.blacklist-ip {
  font-family: monospace;
  font-size: 0.9rem;
}

/* 访问防火墙 */
.firewall-config {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fw-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.fw-label {
  min-width: 70px;
  color: var(--el-text-color-secondary);
}

.fw-row .el-input {
  flex: 1;
}

.fw-tip {
  font-size: 0.8rem;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
  padding: 8px 12px;
  background: var(--el-color-info-light-9);
  border-radius: 6px;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .page {
    padding: 2px 4px;
  }

  .page-title {
    font-size: 1.2rem;
  }

  .online-item {
    padding: 8px 10px;
    gap: 8px;
  }

  .blacklist-item {
    padding: 4px 8px;
  }

  .fw-tip {
    font-size: 0.75rem;
  }
}
</style>
