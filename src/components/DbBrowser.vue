<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { ArrowLeft, Refresh, CaretRight, Grid, Document } from '@element-plus/icons-vue'
import { apiPost } from '@/api.js'
import MonacoEditor from '@/components/MonacoEditor.vue'
import { useMobile } from '@/composables/useMobile.js'

const props = defineProps({
  path: { type: String, default: '' },
})
const emit = defineEmits(['close'])
const { isMobile } = useMobile()

/* ================= 表列表 ================= */
const tables = ref([])
const tablesLoading = ref(false)
const currentTable = ref('')
const currentType = ref('table')
const currentSchema = ref('')

/* ================= SQL 编辑器 ================= */
const sqlText = ref('')
const running = ref(false)

/* ================= 结果区 ================= */
const columns = ref([])
const rows = ref([])
const resultError = ref('')
const execInfo = ref('')
const totalRows = ref(null)
const editableTable = ref('') // 可编辑结果对应的目标表（空表示只读）
const pagedMode = ref(false) // 是否处于分页浏览模式

/* ================= 分页 ================= */
const page = ref(1)
const pageSize = ref(100)
let prevPage = 1
let prevPageSize = 100

/* ================= 内联编辑 ================= */
const pending = reactive(new Map()) // key: `${rowid}|${column}` -> 新值
const editingCell = ref('') // 当前编辑中的单元格 key
const saving = ref(false)
const editInputRef = ref(null) // 当前编辑框实例，用于自动聚焦

const pendingSize = computed(() => pending.size)
const editable = computed(() => editableTable.value !== '')
const resultTitle = computed(() => editableTable.value || currentTable.value)

function isEditable(col, row) {
  if (!editable.value) return false
  if (col === '_nbid') return false
  return row._nbid != null
}

function cellKey(row, col) {
  return `${row._nbid}|${col}`
}

function cellDisplay(row, col) {
  const key = cellKey(row, col)
  if (pending.has(key)) return pending.get(key)
  const v = row[col]
  return v == null ? '' : String(v)
}

function cellIsNull(row, col) {
  return row[col] == null && !pending.has(cellKey(row, col))
}

function startEdit(row, col) {
  if (!isEditable(col, row)) return
  editingCell.value = cellKey(row, col)
  // 动态插入的编辑框原生 autofocus 不生效，需手动聚焦并全选便于覆盖输入
  nextTick(() => {
    editInputRef.value?.focus?.()
    editInputRef.value?.select?.()
  })
}

// 取消编辑（Esc）：不提交，直接还原为原值显示
function cancelEdit() {
  editingCell.value = ''
}

// 单元格变更：与原始值一致则视为撤销，否则记入待保存
function onCellChange(row, col, v) {
  const key = cellKey(row, col)
  const original = row[col] == null ? '' : String(row[col])
  if (v === original) {
    pending.delete(key)
  } else {
    pending.set(key, v)
  }
  editingCell.value = ''
}

function cancelPending() {
  pending.clear()
  editingCell.value = ''
}

// 存在未保存修改时弹确认；确认则清空待保存并返回 true，取消返回 false
async function guardDiscard(msg) {
  if (!pending.size) return true
  try {
    await ElMessageBox.confirm(msg, '提示', { confirmButtonText: '继续', cancelButtonText: '取消', type: 'warning' })
    pending.clear()
    editingCell.value = ''
    return true
  } catch {
    return false
  }
}

async function savePending() {
  if (!pending.size) return
  saving.value = true
  try {
    for (const [key, value] of pending) {
      const sep = key.indexOf('|')
      const rowid = Number(key.slice(0, sep))
      const column = key.slice(sep + 1)
      const res = await apiPost({
        type: 'file_db_update_cell',
        data: { path: props.path, table: editableTable.value, rowid, column, value },
      })
      if (res?.error) throw new Error(res.error)
    }
    ElMessage.success('修改已保存')
    pending.clear()
    await execQuery()
  } catch (e) {
    console.error('保存单元格失败:', e)
    ElMessage.error('保存失败: ' + (e.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

/* ================= 数据加载 ================= */
async function loadTables() {
  tablesLoading.value = true
  try {
    const data = await apiPost({ type: 'file_db_tables', data: { path: props.path } })
    tables.value = data?.tables || []
  } catch (e) {
    console.error('加载数据表失败:', e)
    ElMessage.error('加载数据表失败: ' + (e.message || '未知错误'))
  } finally {
    tablesLoading.value = false
  }
}

// 点击左侧表：进入分页浏览模式
async function browseTable(t) {
  if (!(await guardDiscard('切换表将丢弃未保存的修改，是否继续？'))) return
  currentTable.value = t.name
  currentType.value = t.type || 'table'
  currentSchema.value = t.sql || ''
  pagedMode.value = true
  page.value = 1
  prevPage = 1
  await reloadPage()
}

// 按当前分页参数生成浏览 SQL 并加载数据与总数
async function reloadPage() {
  const off = (page.value - 1) * pageSize.value
  sqlText.value = `SELECT * FROM "${currentTable.value}" LIMIT ${pageSize.value} OFFSET ${off}`
  await execQuery()
  await loadTotalCount()
}

// 执行 SQL（手动执行，退出分页模式；单表 SELECT 结果仍可内联编辑）
async function runSql() {
  if (!sqlText.value.trim()) {
    ElMessage.warning('请输入 SQL')
    return
  }
  if (!(await guardDiscard('执行 SQL 将丢弃未保存的修改，是否继续？'))) return
  pagedMode.value = false
  totalRows.value = null
  currentTable.value = ''
  currentType.value = 'table'
  currentSchema.value = ''
  await execQuery()
}

async function execQuery() {
  running.value = true
  resultError.value = ''
  execInfo.value = ''
  try {
    const data = await apiPost({ type: 'file_db_query', data: { path: props.path, sql: sqlText.value } })
    if (data?.error) {
      resultError.value = data.error
      columns.value = []
      rows.value = []
      editableTable.value = ''
      return
    }
    if (data?.columns) {
      columns.value = data.columns || []
      rows.value = data.rows || []
      execInfo.value = ''
      // 后端对单表 SELECT 自动前置 rowid 并返回可编辑表名
      editableTable.value = data.editable && data.table ? data.table : ''
    } else {
      // 非查询语句：展示影响行数
      columns.value = []
      rows.value = []
      editableTable.value = ''
      const parts = []
      if (data?.rows_affected != null) parts.push(`影响 ${data.rows_affected} 行`)
      if (data?.last_insert_id != null && data.last_insert_id !== 0) parts.push(`自增ID ${data.last_insert_id}`)
      execInfo.value = parts.join('，') || '执行成功'
    }
  } catch (e) {
    console.error('执行 SQL 失败:', e)
    resultError.value = e.message || '执行 SQL 失败'
  } finally {
    running.value = false
  }
}

// 分页浏览模式下查询总行数
async function loadTotalCount() {
  if (!pagedMode.value || !currentTable.value) return
  try {
    const data = await apiPost({
      type: 'file_db_query',
      data: { path: props.path, sql: `SELECT COUNT(*) AS "_nbc" FROM "${currentTable.value}"` },
    })
    if (data?.rows?.length && data.rows[0][0] != null) {
      totalRows.value = Number(data.rows[0][0])
    }
  } catch (e) {
    totalRows.value = null
  }
}

// 翻页：丢弃未保存修改后重载；取消则还原页码
async function onCurrentChange(p) {
  if (!(await guardDiscard('翻页将丢弃未保存的修改，是否继续？'))) {
    page.value = prevPage
    return
  }
  prevPage = p
  await reloadPage()
}

// 修改每页条数：回到第一页并重载；取消则还原
async function onSizeChange(s) {
  const oldSize = prevPageSize
  const oldPage = prevPage
  if (!(await guardDiscard('修改每页条数将丢弃未保存的修改，是否继续？'))) {
    pageSize.value = oldSize
    page.value = oldPage
    return
  }
  prevPageSize = s
  pageSize.value = s
  page.value = 1
  prevPage = 1
  await reloadPage()
}

function clearSql() {
  sqlText.value = ''
  columns.value = []
  rows.value = []
  resultError.value = ''
  execInfo.value = ''
  pagedMode.value = false
  totalRows.value = null
  editableTable.value = ''
  currentTable.value = ''
  currentType.value = 'table'
  currentSchema.value = ''
  pending.clear()
  editingCell.value = ''
}

// 刷新：重列表 + 重载当前数据
async function refreshAll() {
  await loadTables()
  if (currentTable.value) {
    await reloadPage()
  } else if (sqlText.value) {
    await execQuery()
  }
}

// 结果行转对象数组（供 el-table 渲染）
const gridData = computed(() =>
  rows.value.map((r) => {
    const obj = {}
    columns.value.forEach((c, ci) => (obj[c] = r[ci]))
    return obj
  }),
)

onMounted(() => {
  loadTables()
})
</script>

<template>
  <Teleport to="body">
    <div class="db-mask">
      <div class="db-header">
        <ElButton text :icon="ArrowLeft" @click="emit('close')">文件管理</ElButton>
        <span class="db-title" :title="path">{{ path }}</span>
        <div class="db-header-actions">
          <ElButton text :icon="Refresh" title="刷新" @click="refreshAll" />
        </div>
      </div>

      <div class="db-body">
        <!-- 左侧：数据表列表 -->
        <aside class="db-sidebar">
          <div class="db-sidebar-title">数据表</div>
          <div v-if="tablesLoading" v-loading="true" class="db-sidebar-loading"></div>
          <template v-else>
            <div
              v-for="t in tables"
              :key="t.name"
              class="db-table-item"
              :class="{ 'is-active': t.name === currentTable }"
              @click="browseTable(t)"
            >
              <ElIcon :size="14" :color="t.type === 'view' ? '#e6a23c' : '#409eff'">
                <Document v-if="t.type === 'view'" />
                <Grid v-else />
              </ElIcon>
              <span class="db-table-name" :title="t.name">{{ t.name }}</span>
            </div>
            <ElEmpty v-if="!tables.length" description="无数据表" :image-size="60" />
          </template>
        </aside>

        <!-- 右侧：SQL 编辑器 + 结果区 -->
        <main class="db-main">
          <div class="db-sql">
            <div class="db-sql-bar">
              <ElButton size="small" type="primary" :loading="running" @click="runSql">
                <ElIcon class="db-run-icon"><CaretRight /></ElIcon>
                执行
              </ElButton>
              <ElButton size="small" @click="clearSql">清空</ElButton>
              <span class="db-sql-tip">点击左侧表名自动生成查询；支持任意 SQL（查询 / 插入 / 更新 / 删除）</span>
            </div>
            <div class="db-sql-editor">
              <MonacoEditor v-model="sqlText" language="sql" />
            </div>
          </div>

          <div class="db-result">
            <div class="db-result-bar">
              <div class="db-result-left">
                <template v-if="resultTitle">
                  <span class="db-result-title">{{ resultTitle }}</span>
                  <ElTag v-if="currentType === 'view' && currentTable" size="small" type="warning">视图</ElTag>
                  <span v-if="totalRows != null" class="db-result-count">共 {{ totalRows }} 行</span>
                </template>
                <span v-if="rows.length" class="db-result-count">当前显示 {{ rows.length }} 行</span>
              </div>
              <div v-if="editable" class="db-result-actions">
                <span v-if="pendingSize" class="db-pending-count">待保存 {{ pendingSize }} 项</span>
                <ElButton size="small" :disabled="!pendingSize" @click="cancelPending">取消修改</ElButton>
                <ElButton size="small" type="primary" :disabled="!pendingSize" :loading="saving" @click="savePending">
                  保存修改
                </ElButton>
              </div>
            </div>

            <ElAlert
              v-if="resultError"
              type="error"
              :closable="false"
              show-icon
              :title="resultError"
              class="db-alert"
            />
            <ElAlert
              v-else-if="execInfo"
              type="success"
              :closable="false"
              show-icon
              :title="execInfo"
              class="db-alert"
            />
            <div v-if="pagedMode && currentTable && !editable" class="db-tip">
              该表为视图或 WITHOUT ROWID 表，不支持单元格编辑，请使用 SQL 修改
            </div>

            <div v-loading="running" class="db-grid">
              <template v-if="columns.length">
                <ElTable :data="gridData" size="small" border class="db-table">
                  <ElTableColumn
                    v-for="col in columns"
                    :key="col"
                    :prop="col"
                    :label="col"
                    :min-width="isMobile ? 110 : 150"
                    show-overflow-tooltip
                  >
                    <template #default="{ row }">
                      <el-input
                        v-if="editingCell === cellKey(row, col)"
                        ref="editInputRef"
                        :model-value="cellDisplay(row, col)"
                        size="small"
                        placeholder="NULL"
                        @blur="onCellChange(row, col, $event.target.value)"
                        @keydown.enter.prevent="onCellChange(row, col, $event.target.value)"
                        @keydown.esc.prevent="cancelEdit"
                      />
                      <span
                        v-else-if="isEditable(col, row)"
                        class="db-cell-text is-editable"
                        :class="{ 'is-null': cellIsNull(row, col) }"
                        :title="cellDisplay(row, col) || (cellIsNull(row, col) ? 'NULL' : '')"
                        @click="startEdit(row, col)"
                      >
                        {{ cellDisplay(row, col) || (cellIsNull(row, col) ? 'NULL' : '') }}
                      </span>
                      <span v-else class="db-cell-text" :class="{ 'is-null': cellIsNull(row, col) }">
                        {{ cellDisplay(row, col) || (cellIsNull(row, col) ? 'NULL' : '') }}
                      </span>
                    </template>
                  </ElTableColumn>
                </ElTable>
              </template>
              <ElEmpty
                v-else-if="!running && !resultError && !execInfo"
                description="点击左侧表名浏览数据，或输入 SQL 后执行"
                class="db-empty"
              />
            </div>

            <!-- 分页（仅分页浏览模式） -->
            <ElPagination
              v-if="pagedMode && totalRows != null"
              v-model:current-page="page"
              v-model:page-size="pageSize"
              class="db-pagination"
              background
              :small="isMobile"
              :layout="isMobile ? 'prev, pager, next' : 'total, sizes, prev, pager, next, jumper'"
              :total="totalRows"
              :page-sizes="[20, 50, 100, 200]"
              @current-change="onCurrentChange"
              @size-change="onSizeChange"
            />

            <!-- 当前表建表语句 -->
            <ElCollapse v-if="currentSchema" class="db-schema">
              <ElCollapseItem title="建表语句" :name="1">
                <pre class="db-schema-sql">{{ currentSchema }}</pre>
              </ElCollapseItem>
            </ElCollapse>
          </div>
        </main>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.db-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: var(--el-bg-color);
  display: flex;
  flex-direction: column;
}

.db-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.db-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.db-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.db-sidebar {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--el-border-color-lighter);
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
}

.db-sidebar-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 4px 8px 8px;
  flex-shrink: 0;
}

.db-sidebar-loading {
  flex: 1;
  min-height: 120px;
}

.db-table-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.db-table-item:hover {
  background: var(--el-fill-color-light);
}

.db-table-item.is-active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.db-table-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.db-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.db-sql {
  flex-shrink: 0;
  padding: 10px 12px 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.db-sql-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.db-run-icon {
  margin-right: 2px;
}

.db-sql-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.db-sql-editor {
  height: 150px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  overflow: hidden;
}

.db-result {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 12px 12px;
}

.db-result-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.db-result-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.db-result-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.db-result-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.db-result-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.db-pending-count {
  font-size: 12px;
  color: var(--el-color-warning);
}

.db-alert {
  margin-bottom: 8px;
  flex-shrink: 0;
}

.db-tip {
  margin-bottom: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-radius: 4px;
  flex-shrink: 0;
}

.db-grid {
  flex: 1;
  min-height: 120px;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}

.db-empty {
  height: 100%;
}

.db-cell-text {
  display: block;
  font-size: 13px;
  color: var(--el-text-color-primary);
  max-width: 320px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.db-cell-text.is-editable {
  cursor: pointer;
  min-height: 24px;
  line-height: 24px;
  border-radius: 3px;
}

.db-cell-text.is-editable:hover {
  background: var(--el-color-primary-light-9);
  outline: 1px solid var(--el-color-primary-light-5);
}

.db-cell-text.is-null {
  color: var(--el-text-color-placeholder);
  font-style: italic;
}

.db-schema {
  flex-shrink: 0;
  margin-top: 8px;
}

.db-pagination {
  flex-shrink: 0;
  margin-top: 8px;
  justify-content: flex-end;
}

.db-schema-sql {
  margin: 0;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 手机端：侧栏改为顶部横向滚动，收紧间距与分页 */
@media (max-width: 768px) {
  .db-header {
    padding: 8px 10px;
  }

  .db-body {
    flex-direction: column;
  }

  .db-sidebar {
    width: 100%;
    height: 46px;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    overflow-x: auto;
    overflow-y: hidden;
    border-right: none;
    border-bottom: 1px solid var(--el-border-color-lighter);
    padding: 4px 8px;
  }

  .db-sidebar-title {
    padding: 0 6px 0 0;
    flex-shrink: 0;
  }

  .db-table-item {
    flex-shrink: 0;
    padding: 5px 8px;
    white-space: nowrap;
  }

  .db-sql {
    padding: 8px 8px 6px;
  }

  .db-sql-editor {
    height: 110px;
  }

  .db-sql-tip {
    display: none;
  }

  .db-result {
    padding: 8px 8px 10px;
  }

  .db-result-bar {
    gap: 4px;
  }

  .db-result-title {
    max-width: 140px;
  }

  .db-result-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .db-cell-text {
    max-width: 180px;
  }
}
</style>
