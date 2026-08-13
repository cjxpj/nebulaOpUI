<template>
  <div class="page">
    <div class="page-header">
      <div class="header-left">
        <h2 class="page-title">系统状态</h2>
        <p v-if="!isMobile" class="page-subtitle">实时负载与资源占用监控</p>
      </div>
      <div class="refresh-row">
        <span v-if="lastUpdate && !isMobile" class="last-update">更新于 {{ lastUpdate }}</span>
        <ElDropdown @command="onIntervalCommand">
          <ElButton :icon="Refresh" :size="isMobile ? 'small' : 'default'">
            {{ intervalLabel }}
            <ElIcon class="el-icon--right"><ArrowDown /></ElIcon>
          </ElButton>
          <template #dropdown>
            <ElDropdownMenu>
              <ElDropdownItem command="ultra">极高</ElDropdownItem>
              <ElDropdownItem command="high">高</ElDropdownItem>
              <ElDropdownItem command="normal">常规</ElDropdownItem>
              <ElDropdownItem command="low">低</ElDropdownItem>
              <ElDropdownItem command="paused" divided>已暂停</ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>
        <ElButton
          :icon="RefreshRight"
          :loading="checkingUpdate"
          :size="isMobile ? 'small' : 'default'"
          @click="checkUpdate"
        >
          检测更新
        </ElButton>
      </div>
    </div>

    <!-- 顶部统计卡片 -->
    <div class="stat-grid">
      <!-- 负载 -->
      <div class="stat-card">
        <div class="stat-head">
          <span class="stat-title">系统负载</span>
          <span v-if="!isMobile" class="stat-icon">⚖️</span>
        </div>
        <div class="stat-percent load-color">{{ percentText(smoothLoad1) }}</div>
        <ElProgress
          :percentage="Math.min(100, Math.round(smoothLoad1))"
          :stroke-width="isMobile ? 6 : 8"
          :show-text="false"
          color="#a855f7"
        />
        <div class="load-bars">
          <span class="load-item" :class="{ warn: smoothLoad1 >= cpu.cores }">1m {{ percentText(smoothLoad1) }}</span>
          <span class="load-item" :class="{ warn: smoothLoad5 >= cpu.cores }">5m {{ percentText(smoothLoad5) }}</span>
          <span class="load-item" :class="{ warn: smoothLoad15 >= cpu.cores }">15m {{ percentText(smoothLoad15) }}</span>
        </div>
        <div class="stat-detail">核数参考值 {{ cpu.cores }}</div>
      </div>

      <!-- CPU -->
      <div class="stat-card">
        <div class="stat-head">
          <span class="stat-title">CPU 使用率</span>
          <span v-if="!isMobile" class="stat-icon">🖥️</span>
        </div>
        <div class="stat-percent cpu-color">{{ percentText(smoothCpu) }}</div>
        <ElProgress
          :percentage="Math.min(100, Math.round(smoothCpu))"
          :stroke-width="isMobile ? 6 : 8"
          :show-text="false"
          color="#409eff"
        />
        <div class="stat-detail">{{ cpu.cores }} 核心<span v-if="!isMobile"> · {{ cpu.model || '未知型号' }}</span></div>
      </div>

      <!-- 内存 -->
      <div class="stat-card">
        <div class="stat-head">
          <span class="stat-title">内存使用率</span>
          <span v-if="!isMobile" class="stat-icon">🧠</span>
        </div>
        <div class="stat-percent mem-color">{{ percentText(smoothMem) }}</div>
        <ElProgress
          :percentage="Math.min(100, Math.round(smoothMem))"
          :stroke-width="isMobile ? 6 : 8"
          :show-text="false"
          color="#67c23a"
        />
        <div class="stat-detail">
          {{ formatBytes(mem.used) }} / {{ formatBytes(mem.total) }}
        </div>
      </div>

      <!-- 磁盘 IO -->
      <div class="stat-card">
        <div class="stat-head">
          <span class="stat-title">磁盘 IO</span>
          <span v-if="!isMobile" class="stat-icon">💾</span>
        </div>
        <div class="stat-percent disk-color">{{ percentText(smoothDiskIo) }}</div>
        <ElProgress
          :percentage="Math.min(100, Math.round(smoothDiskIo))"
          :stroke-width="isMobile ? 6 : 8"
          :show-text="false"
          color="#e6a23c"
        />
        <div class="stat-detail">
          读 {{ formatRate(diskIo.read_rate) }} · 写 {{ formatRate(diskIo.write_rate) }}
        </div>
      </div>
    </div>

    <!-- 主机信息 -->
    <div class="panel-card">
      <h3 class="card-title">主机信息</h3>
      <ElDescriptions :column="isMobile ? 1 : 4" border :size="isMobile ? 'small' : 'default'">
        <ElDescriptionsItem label="主机名">{{ host.hostname || '-' }}</ElDescriptionsItem>
        <ElDescriptionsItem label="操作系统">{{ host.platform || host.os || '-' }}</ElDescriptionsItem>
        <ElDescriptionsItem label="运行时间">{{ fmtUptime(host.uptime) }}</ElDescriptionsItem>
        <ElDescriptionsItem label="架构">{{ host.arch || '-' }}</ElDescriptionsItem>
      </ElDescriptions>
    </div>

    <!-- 磁盘明细 -->
    <div class="panel-card">
      <h3 class="card-title">磁盘分区</h3>
      <div class="disk-table-wrap">
        <ElTable :data="disk" :size="isMobile ? 'small' : 'default'" empty-text="暂无磁盘信息">
          <ElTableColumn prop="mount" label="挂载点" min-width="100" />
          <ElTableColumn v-if="!isMobile" prop="fs_type" label="文件系统" min-width="80" />
          <ElTableColumn label="容量" :width="isMobile ? 85 : 110">
            <template #default="{ row }">{{ formatBytes(row.total) }}</template>
          </ElTableColumn>
          <ElTableColumn label="已用" :width="isMobile ? 85 : 110">
            <template #default="{ row }">{{ formatBytes(row.used) }}</template>
          </ElTableColumn>
          <ElTableColumn label="使用率" min-width="140">
            <template #default="{ row }">
              <div class="disk-usage-cell">
                <ElProgress
                  :percentage="Math.min(100, Math.round(row.percent))"
                  :stroke-width="isMobile ? 5 : 8"
                  :status="row.percent >= 90 ? 'exception' : row.percent >= 75 ? 'warning' : ''"
                />
                <span class="disk-usage-text">{{ percentText(row.percent) }}</span>
              </div>
            </template>
          </ElTableColumn>
        </ElTable>
      </div>
    </div>

    <!-- 检测更新 -->
    <ElDialog
      v-model="updateDialogVisible"
      title="检测更新"
      :width="isMobile ? '92%' : 460"
    >
      <template v-if="updateInfo">
        <div v-if="updateInfo.status === 'error'" class="update-error">
          <ElAlert :title="updateInfo.error || '更新检测失败'" type="error" show-icon :closable="false" />
          <p v-if="updateInfo.current" style="margin-top: 12px; color: #909399;">你当前版本：{{ updateInfo.current }}</p>
        </div>
        <template v-else>
        <ElDescriptions :column="1" border size="small">
          <ElDescriptionsItem label="当前版本">{{ updateInfo.current || '-' }}</ElDescriptionsItem>
          <ElDescriptionsItem label="最新版本">
            {{ updateInfo.latest || '-' }}
            <ElTag v-if="updateInfo.update" type="danger" size="small" effect="dark" class="update-tag">有新版本</ElTag>
            <ElTag v-else type="success" size="small" effect="dark" class="update-tag">已是最新版本</ElTag>
          </ElDescriptionsItem>
        </ElDescriptions>
        <div v-if="updateInfo.update && updateInfo.notes" class="update-notes">
          <h4>更新说明</h4>
          <ElScrollbar height="200px">
            <div class="update-notes-content">{{ updateInfo.notes }}</div>
          </ElScrollbar>
        </div>
        </template>
      </template>
      <template #footer>
        <ElButton @click="updateDialogVisible = false">关闭</ElButton>
        <ElButton
          v-if="updateInfo?.update && (updateInfo.down_url || updateInfo.url)"
          tag="a"
          :href="updateInfo.down_url || updateInfo.url"
          target="_blank"
          @click="updateDialogVisible = false"
        >
          前往下载页面
        </ElButton>
        <ElButton
          v-if="updateInfo?.update && updateInfo.down_url"
          type="primary"
          :loading="updating"
          @click="doOnlineUpdate"
        >
          在线更新
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Refresh, ArrowDown, RefreshRight } from '@element-plus/icons-vue'
import { useTransition } from '@vueuse/core'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

const { isMobile } = useMobile()

/* ================= 数据 ================= */
const lastUpdate = ref('')
const status = ref({
  cpu: { percent: 0, cores: 0, model: '', load: { load1: 0, load5: 0, load15: 0 } },
  mem: { total: 0, used: 0, free: 0, percent: 0 },
  disk: [],
  disk_io: { read_rate: 0, write_rate: 0, percent: 0 },
  host: { hostname: '', os: '', platform: '', arch: '', uptime: 0 },
})

const cpu = computed(() => status.value.cpu)
const mem = computed(() => status.value.mem)
const disk = computed(() => status.value.disk)
const diskIo = computed(() => status.value.disk_io)
const host = computed(() => status.value.host)

/* ================= 数字平滑过渡 ================= */
const smoothLoad1 = useTransition(() => status.value.cpu.load.load1, { duration: 600 })
const smoothLoad5 = useTransition(() => status.value.cpu.load.load5, { duration: 600 })
const smoothLoad15 = useTransition(() => status.value.cpu.load.load15, { duration: 600 })
const smoothCpu = useTransition(() => status.value.cpu.percent, { duration: 600 })
const smoothMem = useTransition(() => status.value.mem.percent, { duration: 600 })
const smoothDiskIo = useTransition(() => status.value.disk_io.percent, { duration: 600 })

/* ================= 工具函数 ================= */
function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function percentText(v) {
  const n = Number(v)
  if (!isFinite(n) || n < 0) return '0%'
  return `${Math.round(n)}%`
}

// 速率格式化为 KB/s / MB/s
function formatRate(kbps) {
  const n = Number(kbps) || 0
  if (n < 1) return `${n.toFixed(2)} KB/s`
  if (n < 1024) return `${n.toFixed(1)} KB/s`
  return `${(n / 1024).toFixed(2)} MB/s`
}

function fmtUptime(seconds) {
  if (!seconds) return '-'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d} 天 ${h} 小时 ${m} 分钟`
  if (h > 0) return `${h} 小时 ${m} 分钟`
  return `${m} 分钟`
}

/* ================= 更新速度（任务管理器式） ================= */
let timer = null
// 极高 / 高 / 常规 / 低 对应刷新间隔（毫秒），已暂停 ms=0 停止刷新
const INTERVAL_OPTIONS = [
  { key: 'ultra', label: '极高', ms: 300 },
  { key: 'high', label: '高', ms: 500 },
  { key: 'normal', label: '常规', ms: 3000 },
  { key: 'low', label: '低', ms: 4000 },
  { key: 'paused', label: '已暂停', ms: 0 },
]
const intervalKey = ref('normal') // 默认常规
const intervalLabel = computed(
  () => INTERVAL_OPTIONS.find(o => o.key === intervalKey.value)?.label || '常规'
)

let polling = false

async function loadStatus() {
  // 防止上一次请求未完成时 setInterval 重复触发，导致请求堆积
  if (polling) return
  polling = true
  try {
    const data = await apiPost({ type: 'get_sys_status' })
    if (data && data.cpu) {
      status.value = data
      lastUpdate.value = new Date().toLocaleTimeString()
    }
  } catch (e) {
    console.error('获取系统状态失败:', e)
  } finally {
    polling = false
  }
}

function startAuto() {
  stopAuto()
  const opt = INTERVAL_OPTIONS.find(o => o.key === intervalKey.value)
  if (!opt || opt.ms <= 0) return
  timer = setInterval(loadStatus, opt.ms)
}

function stopAuto() {
  if (timer) clearInterval(timer)
  timer = null
  // 重置轮询状态，避免切换页面后残留的 polling 标记影响下次进入
  polling = false
}

// 切换更新速度
function onIntervalCommand(key) {
  intervalKey.value = key
  const opt = INTERVAL_OPTIONS.find(o => o.key === key)
  if (opt && opt.ms > 0) {
    loadStatus()
    startAuto()
    ElMessage.success(`更新速度已切换为：${opt.label}`)
  } else {
    stopAuto()
    ElMessage.info('刷新已暂停')
  }
}

onMounted(() => {
  loadStatus()
  startAuto()
})

onUnmounted(() => {
  stopAuto()
})

/* ================= 检测更新 ================= */
const checkingUpdate = ref(false)
const updateDialogVisible = ref(false)
const updateInfo = ref(null)
const updating = ref(false)

async function checkUpdate() {
  if (checkingUpdate.value) return
  checkingUpdate.value = true
  try {
    const data = await apiPost({ type: 'check_update' })
    updateInfo.value = data
    updateDialogVisible.value = true
    if (data.status === 'error') {
      ElMessage.warning(data.error || '检测更新失败')
    }
  } catch (e) {
    console.error('检测更新失败:', e)
    ElMessage.error('检测更新失败: ' + (e.message || '未知错误'))
  } finally {
    checkingUpdate.value = false
  }
}

async function doOnlineUpdate() {
  if (updating.value) return
  updating.value = true
  try {
    await ElMessageBox.confirm(
      '即将下载最新版本并自动重启，期间服务会短暂中断，确定继续？',
      '在线更新',
      { confirmButtonText: '确定更新', cancelButtonText: '取消', type: 'warning' }
    )
    ElMessage.info('正在下载更新，请稍候...')
    await apiPost({ type: 'online_update' })
  } catch (e) {
    if (e !== 'cancel') {
      console.error('在线更新失败:', e)
      ElMessage.error('在线更新失败: ' + (e.message || '未知错误'))
    }
  } finally {
    updating.value = false
  }
}
</script>

<style scoped>
.page {
  width: 100%;
}

.page-header {
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.header-left {
  display: flex;
  flex-direction: column;
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

.refresh-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.last-update {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* ================= 统计卡片 ================= */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.stat-card {
  padding: 20px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  transition: border-color 0.25s, box-shadow 0.25s;
}

.stat-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

.stat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.stat-title {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.stat-icon {
  font-size: 20px;
}

.stat-percent {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.2;
  margin-bottom: 12px;
}

.cpu-color { color: #409eff; }
.mem-color { color: #67c23a; }
.disk-color { color: #e6a23c; }
.load-color { color: #a855f7; }

.stat-detail {
  margin-top: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 负载 */
.load-bars {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.load-item {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
}

.load-item.warn {
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}

/* ================= 面板卡片 ================= */
.panel-card {
  margin-bottom: 16px;
  padding: 28px 32px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  transition: border-color 0.25s, box-shadow 0.25s;
}

.panel-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

.card-title {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.disk-table-wrap {
  overflow-x: auto;
}

.disk-usage-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.disk-usage-cell .el-progress {
  flex: 1;
  min-width: 80px;
}

.disk-usage-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

/* ================= 移动端适配 ================= */
@media (max-width: 1200px) {
  .stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .page-header {
    margin-bottom: 12px;
  }

  .page-title {
    font-size: 17px;
  }

  .stat-grid {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .stat-card {
    padding: 12px 10px;
    border-radius: 10px;
  }

  .stat-head {
    margin-bottom: 4px;
  }

  .stat-title {
    font-size: 12px;
  }

  .stat-percent {
    font-size: 22px;
    margin-bottom: 6px;
  }

  .stat-detail {
    margin-top: 6px;
    font-size: 11px;
  }

  .load-bars {
    gap: 4px;
  }

  .load-item {
    padding: 1px 6px;
    font-size: 11px;
  }

  .panel-card {
    padding: 14px 12px;
    border-radius: 8px;
  }

  .card-title {
    font-size: 14px;
    margin-bottom: 10px;
  }

  .last-update {
    display: none;
  }
}

@media (max-width: 480px) {
  .stat-grid {
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .page-title {
    font-size: 16px;
  }

  .page-header {
    gap: 4px;
  }

  .stat-card {
    padding: 10px 8px;
  }

  .stat-percent {
    font-size: 20px;
  }

  .stat-title {
    font-size: 11px;
  }

  .stat-detail {
    font-size: 10px;
  }

  .load-item {
    font-size: 10px;
    padding: 1px 4px;
  }

  .panel-card {
    padding: 12px 10px;
  }
}

/* ==================== 检测更新 ==================== */
.update-tag {
  margin-left: 8px;
}

.update-notes {
  margin-top: 16px;
}

.update-notes h4 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.update-notes-content {
  padding: 12px 16px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  color: var(--el-text-color-primary);
}
</style>
