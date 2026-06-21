<script setup>
import { ref, onMounted } from 'vue'
import { ElForm, ElFormItem, ElInput, ElButton, ElMessage, ElSwitch, ElPopconfirm, ElTag, ElCollapse, ElCollapseItem } from 'element-plus'
import { config } from '@/config.js'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

/* ================= 移动端适配 ================= */
const { isMobile } = useMobile()

const instances = ref([])
const loading = ref(false)
const loadFailed = ref(false)
const adding = ref(false)
const savingMap = ref({})

function getTitle(i) { return i.remark || `实例 ${i.section}` }

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
      at_compat: Boolean(item.config.at_compat),
      debug: Boolean(item.config.debug),
      remark: item.config.remark || '',
    }))
    if (instances.value.length === 0) {
      instances.value.push({ section: 'QQ', open: false, dic: 'private/bot/qq', path: 'qq-bot', appid: '', secret: '', at_compat: false, debug: false, remark: 'bot1' })
    }
  } catch (e) { console.error('获取 QQ 配置失败:', e); loadFailed.value = true; ElMessage.error('获取 QQ 配置失败') }
  finally { loading.value = false }
}

/* ================= 保存 ================= */
async function saveInstance(instance, silent) {
  if (loadFailed.value) return
  if (instance.open && !instance.path) return ElMessage.error('访问路径不能为空')
  if (instance.open && !instance.appid) return ElMessage.error('APPID 不能为空')
  savingMap.value[instance.section] = true
  try {
    await apiPost({ type: 'save_qq', data: { section: instance.section, config: {
        open: instance.open, dic: instance.dic, path: instance.path, appid: instance.appid,
        secret: instance.secret, at_compat: instance.at_compat, debug: instance.debug, remark: instance.remark,
      }}})
    if (!silent) ElMessage.success(`${getTitle(instance)} 已保存`)
  } catch (e) { console.error('保存 QQ 配置失败:', e); if (!silent) ElMessage.error('保存失败') }
  finally { savingMap.value[instance.section] = false }
}

function onOpenChange(instance) { saveInstance(instance, true) }

/* ================= 增删实例 ================= */
async function addInstance() {
  adding.value = true
  try {
    const data = await apiPost({ type: 'add_qq' })
    const inst = {
      section: data.section, open: Boolean(data.config.open),
      dic: data.config.dic || 'private/bot/qq', path: data.config.path || 'qq-bot',
      appid: data.config.appid || '', secret: data.config.secret || '',
      at_compat: Boolean(data.config.at_compat), debug: Boolean(data.config.debug),
      remark: data.config.remark || `bot${instances.value.length + 1}`,
    }
    instances.value.push(inst)
    ElMessage.success('新实例已添加')
  } catch (e) { console.error('添加 QQ 实例失败:', e); ElMessage.error('添加实例失败') }
  finally { adding.value = false }
}

async function deleteInstance(instance, index) {
  try {
    await apiPost({ type: 'del_qq', data: { section: instance.section } })
    instances.value.splice(index, 1); ElMessage.success('已删除')
  } catch (e) { console.error('删除 QQ 实例失败:', e); ElMessage.error('删除失败') }
}

onMounted(loadConfig)
</script>

<template>
  <div class="page">
    <!-- ========== 页面头部 ========== -->
    <div class="page-header">
      <div class="header-row">
        <div class="header-text">
          <h2 class="page-title">QQ 官方机器人</h2>
          <p class="page-subtitle">配置 QQ 官方机器人对接参数，支持多实例部署</p>
        </div>
        <ElButton type="success" :loading="adding" :disabled="loadFailed" @click="addInstance">
          添加实例
        </ElButton>
      </div>
    </div>

    <!-- ========== 加载失败 ========== -->
    <div v-if="loadFailed" class="error-state">
      <span>配置加载失败，请检查后端服务是否正常运行</span>
    </div>

    <!-- ========== 实例列表 ========== -->
    <div v-else class="instance-grid">
      <ElCollapse v-for="(inst, idx) in instances" :key="inst.section" class="instance-card">
        <ElCollapseItem :name="inst.section">
        <template #title>
          <div class="collapse-title">
            <ElSwitch
              v-model="inst.open"
              size="small"
              :disabled="loadFailed"
              @click.stop
              @change="onOpenChange(inst)"
            />
            <ElTag
              :type="inst.open ? 'success' : 'info'"
              size="small"
              effect="plain"
              class="status-tag"
            >
              {{ inst.open ? 'ON' : 'OFF' }}
            </ElTag>
            <ElInput
              v-model="inst.remark"
              size="small"
              class="remark-input"
              placeholder="备注"
              @click.stop
              @blur="saveInstance(inst, true)"
            />
            <ElPopconfirm
              v-if="instances.length > 1 && inst.section !== 'QQ'"
              title="确定删除该实例？"
              @click.stop
              @confirm="deleteInstance(inst, idx)"
            >
              <template #reference>
                <ElButton type="danger" size="small" text class="delete-btn">删除</ElButton>
              </template>
            </ElPopconfirm>
          </div>
        </template>

        <div class="collapse-body">
          <ElForm
            :model="inst"
            :label-position="isMobile ? 'top' : 'right'"
            size="default"
          >
            <el-row :gutter="24">
              <el-col :xs="24" :sm="12">
                <ElFormItem label="APPID">
                  <ElInput v-model="inst.appid" placeholder="请输入 APPID" />
                </ElFormItem>
              </el-col>
              <el-col :xs="24" :sm="12">
                <ElFormItem label="密钥">
                  <ElInput v-model="inst.secret" show-password placeholder="请输入密钥" />
                </ElFormItem>
              </el-col>
              <el-col :xs="24" :sm="12">
                <ElFormItem label="词库">
                  <ElInput v-model="inst.dic" placeholder="例如 private/bot/qq" />
                </ElFormItem>
              </el-col>
              <el-col :xs="24" :sm="12">
                <ElFormItem label="访问路径">
                  <ElInput v-model="inst.path" placeholder="例如 qq-bot" />
                </ElFormItem>
              </el-col>
              <el-col :xs="24" :sm="12">
                <ElFormItem label="全量艾特兼容">
                  <ElSwitch v-model="inst.at_compat" size="small" />
                </ElFormItem>
              </el-col>
              <el-col :xs="24" :sm="12">
                <ElFormItem label="调试打印">
                  <ElSwitch v-model="inst.debug" size="small" />
                </ElFormItem>
              </el-col>
            </el-row>
            <ElFormItem>
              <div class="form-actions">
                <ElButton type="primary" :loading="savingMap[inst.section]" @click="saveInstance(inst)">
                  保存配置
                </ElButton>
              </div>
            </ElFormItem>
          </ElForm>
        </div>
      </ElCollapseItem>
      </ElCollapse>
    </div>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
}

/* ========== 页面头部 ========== */
.page-header {
  margin-bottom: 24px;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
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

/* ========== 错误状态 ========== */
.error-state {
  text-align: center;
  color: var(--el-color-danger);
  padding: 40px 20px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  font-size: 14px;
}

/* ========== 实例列表容器 ========== */
.instance-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ========== 独立折叠卡片 ========== */
.instance-card {
  border: none;
}

.instance-card :deep(.el-collapse-item) {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.25s, box-shadow 0.25s;
}

.instance-card :deep(.el-collapse-item:hover) {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

.instance-card :deep(.el-collapse-item__header) {
  height: auto;
  min-height: 48px;
  padding: 10px 20px;
  border: none;
  background: transparent;
  font-size: inherit;
  line-height: inherit;
}

.instance-card :deep(.el-collapse-item__wrap) {
  border: none;
  border-top: 1px solid var(--el-border-color-lighter);
  background: transparent;
}

.instance-card :deep(.el-collapse-item__content) {
  padding: 20px 24px 24px;
}

/* ========== 折叠标题栏 ========== */
.collapse-title {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding-right: 8px;
}

.status-tag {
  flex-shrink: 0;
  font-size: 12px;
}

.remark-input {
  width: 180px;
  flex-shrink: 0;
}

.remark-input :deep(.el-input__wrapper) {
  padding: 0 8px;
  box-shadow: none;
  background: transparent;
}

.remark-input :deep(.el-input__inner) {
  font-size: 13px;
  font-weight: 600;
}

.remark-input:hover :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-border-color) inset;
}

.remark-input:focus-within :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}

.delete-btn {
  flex-shrink: 0;
  margin-left: auto;
}

/* ========== 折叠体 ========== */
.collapse-body :deep(.el-form-item) {
  margin-bottom: 16px;
}

.collapse-body :deep(.el-form-item:last-child) {
  margin-bottom: 0;
}

.collapse-body :deep(.el-form-item__label) {
  width: 100px;
}

.form-actions {
  width: 100%;
  display: flex;
  justify-content: flex-end;
}

/* ========== 响应式 ========== */
@media (max-width: 768px) {
  .instance-grid {
    gap: 8px;
  }

  .page-title {
    font-size: 18px;
  }

  .header-row {
    flex-direction: column;
    gap: 12px;
  }

  .header-row .el-button {
    align-self: flex-start;
  }

  .instance-card :deep(.el-collapse-item__header) {
    padding: 8px 12px;
  }

  .instance-card :deep(.el-collapse-item__content) {
    padding: 12px 14px 16px;
  }

  .collapse-title {
    gap: 6px;
  }

  .remark-input {
    width: 90px;
  }

  .form-actions :deep(.el-button) {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .page-header {
    margin-bottom: 16px;
  }

  .page-title {
    font-size: 16px;
  }

  .page-subtitle {
    font-size: 12px;
  }

  .instance-card :deep(.el-collapse-item) {
    border-radius: 8px;
  }

  .instance-card :deep(.el-collapse-item__header) {
    padding: 6px 10px;
  }

  .instance-card :deep(.el-collapse-item__content) {
    padding: 10px 12px 14px;
  }
}
</style>
