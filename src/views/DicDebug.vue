<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, inject, h, nextTick } from 'vue'
import { ElForm, ElFormItem, ElSelect, ElOption, ElInput, ElInputNumber, ElButton, ElSwitch, ElDialog, ElMessage, ElMessageBox, ElEmpty, ElTag, ElIcon } from 'element-plus'
import { DocumentChecked, Setting, VideoPlay, ArrowLeftBold, ArrowRightBold, ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
// 编辑器核心特性（contrib），不含内置语言与语言服务
import 'monaco-editor/esm/vs/editor/browser/widget/codeEditor/codeEditorWidget.js'
import 'monaco-editor/esm/vs/editor/browser/coreCommands.js'
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.js'
import 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard.js'
import 'monaco-editor/esm/vs/editor/contrib/comment/browser/comment.js'
import 'monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu.js'
import 'monaco-editor/esm/vs/editor/contrib/cursorUndo/browser/cursorUndo.js'
import 'monaco-editor/esm/vs/editor/contrib/dnd/browser/dnd.js'
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js'
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js'
import 'monaco-editor/esm/vs/editor/contrib/indentation/browser/indentation.js'
import 'monaco-editor/esm/vs/editor/contrib/lineSelection/browser/lineSelection.js'
import 'monaco-editor/esm/vs/editor/contrib/linesOperations/browser/linesOperations.js'
import 'monaco-editor/esm/vs/editor/contrib/links/browser/links.js'
import 'monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor.js'
import 'monaco-editor/esm/vs/editor/contrib/smartSelect/browser/smartSelect.js'
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js'
import 'monaco-editor/esm/vs/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode.js'
import 'monaco-editor/esm/vs/editor/contrib/unicodeHighlighter/browser/unicodeHighlighter.js'
import 'monaco-editor/esm/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.js'
import 'monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations.js'
import 'monaco-editor/esm/vs/editor/contrib/wordPartOperations/browser/wordPartOperations.js'
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css'
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon-modifiers.css'
// Worker（相对路径导入，绕开 exports 限制）
import EditorWorker from '../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

/* ================= Monaco Worker 配置 ================= */
self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker()
  },
}

/* ================= 注册词库语言高亮 ================= */
monaco.languages.register({ id: 'nebula' })
monaco.languages.setMonarchTokensProvider('nebula', {
  defaultToken: '',
  tokenizer: {
    root: [
      [/\/\/.*$/, 'comment'],
      [/\/\*/, 'comment', '@commentBlock'],
      [/±/, 'string', '@pic'],
      [/\$/, 'keyword', '@cmd'],
      [/%[^\n%]*%/, 'variable.predefined'],
      [/"""/, 'string', '@markdown'],
      [/#[^\n#]+#/, 'keyword'],
      [/\[[FL]\]/, 'keyword'],
      [/\b\d+\b/, 'number'],
    ],
    cmd: [
      [/\$/, 'keyword', '@pop'],
      [/[^$\n]+/, 'keyword'],
    ],
    pic: [
      [/±/, 'string', '@pop'],
      [/[^±\n]+/, 'string'],
    ],
    markdown: [
      [/"""/, 'string', '@pop'],
      [/[^"]+/, 'string'],
      [/"/, 'string'],
    ],
    commentBlock: [
      [/\*\//, 'comment', '@pop'],
      [/[^*]+/, 'comment'],
      [/./, 'comment'],
    ],
  },
})

/* ================= 代码补全（命令/变量/关键字） ================= */
// 无子命令的词库命令（来源：dic/funcs/registry.go 与 bot 动态注入）
const DIC_CMDS_FLAT = [
  // 字符串
  '文本长度', '长度', '复读', '去除左右', '去除左', '去除右', '字符拼接', '查找字',
  '取中间', '截取', '替换', '分割', '字符切片', '大写字母', '小写字母', '中文转拼音', '炫酷文字',
  // 数字
  '数字格式化', '数字转中文', '四舍五入', '计算',
  // 随机
  '随机文本', '随机数', '随机大小字母', '随机大写字母', '随机小写字母',
  '随机大小字母数字', '随机小写字母数字', '随机大写字母数字', '随机数字',
  // 变量
  '线程变量', '临时写', '临时读', '变量', '存在变量', '全局变量', '锁变量', '变量文本',
  // 流程控制
  '判断值', '判断空值', '延迟', '捕获输出', '拦截输出', 'STOP', '重启', 'GC回收',
  // 文件操作
  '读', '写', '写文件', '读文件', '读文件行', '文件后缀', '存在文件', '存在文件夹',
  '存在文件或文件夹', '删除文件', '删除文件夹', '文件夹列表', '文件列表', '随机文件名',
  '随机文件夹名', '文件夹大小', '文件大小', '重命名', '复制粘贴', '下载文件',
  // 日志
  '日志', '打印',
  // 编码/解码
  '编码', '解码', 'MD5编码', 'B64编码', 'B64解码', 'URL编码', 'URL解码', 'URL链接编码',
  'URL链接解码', 'sha256', 'Byte生成', 'Byte转String', 'MD转义', 'MIME类型', '加密词库',
  // 正则
  '分割匹配', '正则替换', '正则匹配', '正则',
  // 加密/解密
  '哈基米加密', '哈基米解密',
  // Ed25519
  'Ed25519种子大小', 'Ed25519生成密钥', 'Ed25519从种子生成密钥', 'Ed25519签名',
  'Ed25519验证签名', 'Ed25519公钥转换为Curve25519', 'Ed25519私钥转换为Curve25519',
  'Ed25519从Curve25519生成密钥',
  // 网络访问
  '访问', '访问POST', '访问转发',
  // 数据库
  '关闭数据库',
  // JSON
  'JSON解析', 'json解析', 'JSON判断', 'JSON存', 'JSON存字', 'JSON追加', 'JSON追加字',
  'JSON删', 'JSON存在', 'JSON长度', 'JSON美化', 'JSON重名解析',
  // HTML / Markdown
  'HTML解析', 'HTML编码', 'HTML解码', 'MD转HTML',
  // 绘图
  '绘图', '写图片', '读图片',
  // 其他
  'GIF拆帧', '图片相似度', '排序', '范围', 'ZIP压缩', 'ZIP解压', '主机',
  '时间戳格式化时间', '时间间隔', '取前字符', '取后字符',
  // bot 动态注入
  '获取账号', '搜索账号', '群单发', '群发', '群单发图', '群单发MD', '群单发语音',
  '群单发视频', '私聊', '私聊图', '发送文本', '发送MD', '发送视频', '发送语音', 'IMG', '调用',
  // 词库执行 / WebSocket（dic/registry.go）
  '执行词库', '执行词库文件', '回调', '执行PHP网页词库', '执行PHP网页词库文件',
  '执行网页词库', '执行网页词库文件', 'WS连接', 'WS断开', 'WS发送', '读词库', '写词库',
]

// 带子命令的词库命令（子命令格式：父命令.子命令）
const DIC_CMDS_SUB = {
  字典: ['创建', '设置', '获取'],
  读文件: ['随机一行', '行数'],
  AES: ['CBC加密', 'CBC解密', 'CFB加密', 'CFB解密', 'GCM加密', 'GCM解密', 'CTR加密', 'CTR解密'],
  访问: ['新建', '切换GET', '切换POST', '启用跳转', '禁用跳转', '设置头部', '设置超时', 'POST', 'POST文件', '发送', '全部内容', '内容'],
  终端: ['创建', 'Shell创建', '异步执行', '执行目录', '执行', '等待输入', '解码器', '变量', '断开', '输入', '监听执行'],
  mysql: ['新建', 'PING', '执行', '切换数据库', '写', '读', '删除文件', '删除文件夹', '关闭'],
  sqlite: ['打开', '写', '读', '执行', '删除文件', '删除文件夹'],
  读: ['sqlite'],
  写: ['sqlite'],
  db: ['写', '读', '删除', '删除文件', '删除文件夹'],
  json: ['查找文本', '模糊查找文本', '正则查找文本'],
  画布: ['创建', '获取', '旋转', '圆形', '灰度', '马赛克'],
  画笔: ['字体', '大小', '获取颜色', '设置颜色'],
  绘制: ['文本', '点', '线', '喷漆', '波浪', '油漆桶', '方形', '方形描边', '椭圆', '椭圆描边', '圆形', '圆形描边', '多边形', '多边形描边', '图片', '圆弧', '随机点', '随机线条', '高斯模糊', '马赛克'],
  邮件: ['创建', '发送', '发送HTML'],
  腾讯: ['接口', '调用'],
}

// 无参数命令（插入时不带参数占位）
const DIC_NO_ARG_CMDS = new Set([
  'STOP', '重启', 'GC回收', '捕获输出', '拦截输出', 'Ed25519种子大小', 'Ed25519生成密钥',
])

// 内置变量（来源：dto/value.go 的 Text 内置值）
const DIC_BUILTIN_VARS = [
  ['时间', '当前时间'],
  ['时间戳', '秒级时间戳'],
  ['毫秒时间戳', '毫秒级时间戳'],
  ['微秒时间戳', '微秒级时间戳'],
  ['纳秒时间戳', '纳秒级时间戳'],
  ['空格', '一个空格'],
  ['换行', '换行符'],
  ['系统', '操作系统类型'],
  ['版本', '程序版本'],
  ['触发词', '当前触发词'],
  ['触发', '匹配到的触发内容'],
  ['括号0', '整个消息（正则整组匹配）'],
  ['参数0', '整个消息（空格分割第 0 段）'],
  ['URL编码@变量', '对变量做 URL 编码', 'URL编码@${1:变量}%', 'URL编码'],
  ['B64编码@变量', '对变量做 Base64 编码', 'B64编码@${1:变量}%', 'B64编码'],
  ['URL@变量', '对变量做 URL 解码', 'URL@${1:变量}%', 'URL'],
  ['B64@变量', '对变量做 Base64 解码', 'B64@${1:变量}%', 'B64'],
  ['TYPE@变量', '获取变量类型', 'TYPE@${1:变量}%', 'TYPE'],
  ['!变量', '布尔/数值取反', '!${1:变量}%', '!'],
  ['时间yyyy-MM-dd', '格式化当前时间', '时间${1:yyyy-MM-dd HH:mm:ss}%', '时间'],
  ['随机数1-100', '区间随机数', '随机数${1:1}-${2:100}%', '随机数'],
]
const DIC_BUILTIN_VAR_SET = new Set(DIC_BUILTIN_VARS.map((v) => v[0]))

// 段/关键字（第 4 项为触发类别：# 段标记、[ 前缀标记、manual 仅手动补全时显示）
const DIC_KEYWORDS = [
  ['#私聊#', '私聊段前缀（仅私聊消息触发）', '#私聊#', '#'],
  ['[F]', '函数式触发（插件可调用）', '[F]', '['],
  ['[L]', '内部触发', '[L]', '['],
  ['[函数]', '函数声明', '[函数]', '['],
  ['[类]', '类声明', '[类]', '['],
  ['±图片地址±', '发送图片', '±${1:图片地址}±', 'manual'],
  ['"""多行文本"""', '多行文本内容', '"""\n${1:内容}\n"""', 'manual'],
]

// 构造补全项
function cmdItem(name) {
  const noArg = DIC_NO_ARG_CMDS.has(name)
  return {
    label: name,
    kind: monaco.languages.CompletionItemKind.Function,
    detail: '词库命令',
    sortText: 'a' + name,
    // 闭合的 $ 直接字面输出（snippet 中结尾裸 $ 视为字面符号，避免 $$ 转义产生多余 $）
    insertText: noArg ? name + '$' : name + ' ${1:参数}$',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
  }
}

function varItem(name, detail, snippet, filterText) {
  return {
    label: name,
    kind: monaco.languages.CompletionItemKind.Variable,
    detail: detail || '词库变量',
    sortText: 'b' + name,
    // filterText 决定 Monaco 的过滤匹配词（如 label「时间yyyy-MM-dd」按「时间」匹配）
    filterText: filterText || name,
    insertText: snippet || name + '%',
    insertTextRules: snippet
      ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
      : undefined,
  }
}

function kwItem(name, detail, insert) {
  // 含 $ 占位符的项需作为 snippet 插入，否则 ${...} 会原样输出
  const isSnippet = !!insert && insert.includes('$')
  return {
    label: name,
    kind: monaco.languages.CompletionItemKind.Keyword,
    detail: detail || '词库关键字',
    sortText: 'c' + name,
    insertText: insert || name,
    insertTextRules: isSnippet
      ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
      : undefined,
  }
}

// 解析运行配置中注入的全局变量键名（每项 key=value，# 开头为注释）
function injectedGVars() {
  const names = []
  for (const item of dicForm.value.g || []) {
    const t = String(item).trim()
    if (!t || t.startsWith('#')) continue
    const idx = t.indexOf('=')
    if (idx > 0) names.push(t.slice(0, idx).trim())
  }
  return names
}

// 扫描当前词库内容中出现的 %变量%
function scanDicVars(text) {
  const set = new Set()
  const re = /%([^%\n]+)%/g
  let m
  while ((m = re.exec(text))) {
    const v = m[1].trim()
    if (v) set.add(v)
  }
  return set
}

// 判断光标前的触发字符（$ 命令、% 变量、# 段、[ 前缀）
function detectTrigger(model, position) {
  const line = model.getLineContent(position.lineNumber)
  const before = line.slice(0, position.column - 1)
  for (let i = before.length - 1; i >= 0; i--) {
    const ch = before[i]
    if (ch === '$') return 'cmd'
    if (ch === '%') return 'var'
    if (ch === '#') return 'kw'
    if (ch === '[') return 'prefix'
    // 遇到空格/制表符说明进入参数区，不再向前匹配
    if (ch === ' ' || ch === '\t') break
  }
  return 'all'
}

// 计算补全的替换范围：仅 [ 前缀与 # 段这类「插入文本以触发字符开头」的补全，
// 需要覆盖从触发字符到光标的全部内容（含其后跟随的字符，如已输入的 [F），
// 否则已输入的触发字符会残留，出现 [[F]、##私聊# 的重复符号
function getReplaceRange(model, position, trigger) {
  if (trigger !== 'prefix' && trigger !== 'kw') return undefined
  const line = model.getLineContent(position.lineNumber)
  const before = line.slice(0, position.column - 1)
  const ch = trigger === 'prefix' ? '[' : '#'
  let start = -1
  for (let i = before.length - 1; i >= 0; i--) {
    if (before[i] === ch) {
      start = i
      break
    }
    // 触发字符与光标之间的其它字符（如 [F）一并覆盖；遇到空白停止
    if (before[i] === ' ' || before[i] === '\t') break
  }
  if (start < 0) return undefined
  return new monaco.Range(position.lineNumber, start + 1, position.lineNumber, position.column)
}

// 注册词库补全：$ 命令、% 变量、# 段标记、[ 前缀标记；Ctrl+Space 显示全部
monaco.languages.registerCompletionItemProvider('nebula', {
  triggerCharacters: ['$', '%', '#', '['],
  provideCompletionItems(model, position, context) {
    const isTriggerChar =
      context?.triggerKind === monaco.languages.CompletionTriggerKind.TriggerCharacter
    // 字符触发时按触发类型过滤候选；手动补全（Ctrl+Space）显示全部
    const trigger = isTriggerChar ? detectTrigger(model, position) : 'all'
    // 替换范围：仅 [ 前缀、# 段触发时需要覆盖已输入的触发字符
    const insertRange = getReplaceRange(model, position, trigger)
    const text = model.getValue()
    const items = []

    const showCmd = trigger === 'all' || trigger === 'cmd'
    const showVar = trigger === 'all' || trigger === 'var'
    const showKw = trigger === 'all' || trigger === 'kw'
    const showPrefix = trigger === 'all' || trigger === 'prefix'

    // 命令
    if (showCmd) {
      for (const name of DIC_CMDS_FLAT) {
        items.push(cmdItem(name))
      }
      for (const parent of Object.keys(DIC_CMDS_SUB)) {
        for (const sub of DIC_CMDS_SUB[parent]) {
          items.push(cmdItem(parent + '.' + sub))
        }
      }
    }

    // 段/前缀标记
    if (showKw || showPrefix) {
      for (const [name, detail, insert, cat] of DIC_KEYWORDS) {
        if (trigger === 'all') items.push(kwItem(name, detail, insert))
        else if (cat === '#' && showKw) items.push(kwItem(name, detail, insert))
        else if (cat === '[' && showPrefix) items.push(kwItem(name, detail, insert))
      }
    }

    // 变量
    if (showVar) {
      for (const [name, detail, snippet, filterText] of DIC_BUILTIN_VARS) {
        items.push(varItem(name, detail, snippet, filterText))
      }

      // 词库中已使用的变量（去重，内置变量不重复展示）
      const seen = new Set()
      for (const v of scanDicVars(text)) {
        if (!DIC_BUILTIN_VAR_SET.has(v) && !seen.has(v)) {
          seen.add(v)
          items.push(varItem(v, '词库中已使用'))
        }
      }

      // 已注入的全局变量
      for (const name of injectedGVars()) {
        if (!DIC_BUILTIN_VAR_SET.has(name) && !seen.has(name)) {
          seen.add(name)
          items.push(varItem(name, '已注入的全局变量'))
        }
      }
    }

    // 设置替换范围：覆盖已输入的触发字符与其后内容，避免补全后残留多余符号
    if (insertRange) {
      for (const item of items) item.range = insertRange
    }

    return { suggestions: items }
  },
})

/* ================= 移动端适配 ================= */
const { isMobile } = useMobile()

/* ================= 主题 ================= */
const isDarkMode = inject('isDarkMode')

/* ================= 默认调试词库 ================= */
const DEFAULT_DEBUG_DIC = 'private/debug.n'

/* ================= 词库文件搜索（仅输入时模糊查找，只搜当前词库所在目录） ================= */
const dicFiles = ref([])
const searchLoading = ref(false)
let dicSearchTimer = null
let dicSearchSeq = 0 // 请求序号：丢弃过期响应，防止乱序覆盖
let dicLastKw = '' // 已搜索过的关键字：相同关键字不重复请求

// 当前词库所在目录（用于限定搜索范围，只扫这一个文件夹）
function currentDicDir() {
  const p = (dicForm.value.path || '').trim()
  const idx = p.lastIndexOf('/')
  return idx > 0 ? p.slice(0, idx) : 'private'
}

// 输入关键字时向后端模糊搜索当前目录下的 .n 文件
function searchDicFiles(keyword) {
  clearTimeout(dicSearchTimer)
  const kw = (keyword || '').trim()
  dicSearchTimer = setTimeout(async () => {
    if (!kw) {
      // 未输入关键字不加载列表
      dicSearchSeq++
      dicLastKw = ''
      dicFiles.value = []
      searchLoading.value = false
      return
    }
    if (kw === dicLastKw) return // 相同关键字已搜索过，避免重复请求造成闪烁
    const seq = ++dicSearchSeq
    searchLoading.value = true
    try {
      const data = await apiPost({
        type: 'get_dic_list',
        data: { search: kw, base: currentDicDir(), limit: 200 },
      })
      if (seq !== dicSearchSeq) return // 已有更新的搜索请求，丢弃过期结果
      dicFiles.value = data.files || []
      dicLastKw = kw
    } catch (e) {
      console.warn('搜索词库失败:', e)
      // 失败时保留旧列表，避免下拉闪烁
    } finally {
      if (seq === dicSearchSeq) searchLoading.value = false
    }
  }, 300)
}

/* ================= 调试表单 ================= */
const dicForm = ref({
  path: '',
  trigger: 'Main',
  g: [],
  // 超时（秒），0 表示不限时
  timeout: 15,
})
const gKeyInput = ref('')
const gValueInput = ref('')
const gKeyInputEl = ref(null)

const saveRun = ref(false)
// 实时保存：编辑时自动写入词库文件（不触发运行）
const autoSave = ref(false)
const running = ref(false)
const configVisible = ref(false)

/* ================= 运行配置（仅存后端：打开时读取，关闭时确认保存） ================= */
const NEVER_ASK_CONFIG_KEY = 'nebula_dic_debug_never_ask'
const configDirty = ref(false)
let configSnapshot = null // 打开弹窗时的配置快照，用于检测修改与「不保存」时恢复
let configLoadSeq = 0 // 读取请求序号：丢弃过期响应，防止旧请求覆盖新读取
const neverAsk = ref(false)

// 判断当前配置是否与快照一致（精确比较，避免 applyConfig 的异步时序误标为已修改）
function configsEqual(a, b) {
  if (!a || !b) return false
  return (
    (a.path || '') === (b.path || '') &&
    (a.trigger || '') === (b.trigger || '') &&
    Number(a.timeout || 0) === Number(b.timeout || 0) &&
    !!a.saveRun === !!b.saveRun &&
    !!a.autoSave === !!b.autoSave &&
    JSON.stringify(a.g || []) === JSON.stringify(b.g || [])
  )
}

// 应用配置对象到表单
function applyConfig(saved) {
  if (!saved) return
  if (saved.path) dicForm.value.path = saved.path
  if (saved.trigger !== undefined) dicForm.value.trigger = saved.trigger
  if (saved.g !== undefined) {
    // 兼容旧数据（字符串，每行 key=value）与新数据（数组）
    dicForm.value.g = Array.isArray(saved.g)
      ? saved.g.filter(Boolean)
      : String(saved.g).split('\n').map((s) => s.trim()).filter(Boolean)
  }
  if (saved.saveRun !== undefined) saveRun.value = saved.saveRun
  if (saved.autoSave !== undefined) autoSave.value = saved.autoSave
  if (saved.timeout !== undefined) dicForm.value.timeout = saved.timeout
}

// 读取运行配置：每次从后端读取最新配置（不缓存到本地）
async function loadConfig() {
  const seq = ++configLoadSeq
  let applied = false
  try {
    const data = await apiPost({ type: 'get_dic_config' })
    if (seq !== configLoadSeq) return // 已有更新的读取请求，丢弃过期结果
    // 若用户已开始编辑（configDirty），不覆盖表单，避免读取结果冲掉用户输入
    if (data && Object.keys(data).length > 0 && !configDirty.value) {
      applyConfig(data)
      applied = true
    }
  } catch (e) {
    console.warn('读取运行配置失败:', e)
  } finally {
    if (seq === configLoadSeq && applied) {
      // 只有成功应用配置才同步基线；用户已修改时保留其修改与 dirty 标记
      configSnapshot = buildConfig()
      configDirty.value = false
    }
  }
}

// 构造配置对象
function buildConfig() {
  return {
    path: dicForm.value.path,
    trigger: dicForm.value.trigger,
    // g 需拷贝一份，避免快照与表单共享同一数组引用导致脏检测失效
    g: [...dicForm.value.g],
    saveRun: saveRun.value,
    autoSave: autoSave.value,
    timeout: dicForm.value.timeout,
  }
}

// 保存运行配置到后端
async function saveConfig() {
  let res
  try {
    res = await apiPost({ type: 'save_dic_config', data: buildConfig() })
  } catch (e) {
    ElMessage.error('保存运行配置失败')
    throw e
  }
  if (!res || res.status !== 'ok') {
    ElMessage.error('保存运行配置失败')
    throw new Error('save_dic_config failed')
  }
  configSnapshot = buildConfig()
  configDirty.value = false
}

// 配置变化时精确比对快照，判断是否真正修改
watch(
  [
    () => dicForm.value.path,
    () => dicForm.value.trigger,
    () => dicForm.value.g,
    saveRun,
    autoSave,
    // timeout 也参与脏检测，否则只改超时时不会触发保存
    () => dicForm.value.timeout,
  ],
  () => {
    configDirty.value = !configsEqual(buildConfig(), configSnapshot)
  },
  { deep: true }
)

// 每次打开弹窗时重新读取后端最新配置
watch(configVisible, (v) => {
  if (v) loadConfig()
})

// 关闭弹窗：有修改时询问是否保存（可勾选下次不再提示）
function handleConfigClose(done) {
  // 保存成功后关闭（configSnapshot 已在 saveConfig 中同步）
  const persistAndClose = () => {
    saveConfig()
      .then(() => {
        ElMessage.success('运行配置已保存')
        done()
      })
      .catch(() => {
        // 保存失败：保留修改，不关闭弹窗，让用户重试
        ElMessage.error('保存失败，配置未保存，请重试')
      })
  }
  // 不保存：恢复为打开时的配置，避免内存残留导致下次读到"改了一半"的值
  const discardAndClose = () => {
    if (configSnapshot) {
      applyConfig(configSnapshot)
    }
    configDirty.value = false
    done()
  }
  if (!configDirty.value) {
    done()
    return
  }
  // 已勾选不再提示：直接保存后关闭
  if (localStorage.getItem(NEVER_ASK_CONFIG_KEY) === '1') {
    persistAndClose()
    return
  }
  neverAsk.value = false
  ElMessageBox.confirm(
    h('div', { class: 'config-save-confirm' }, [
      h('p', { class: 'config-save-text' }, '运行配置已修改，是否保存？'),
      h('label', { class: 'config-save-ask' }, [
        h('input', {
          type: 'checkbox',
          onChange: (e) => (neverAsk.value = e.target.checked),
        }),
        h('span', '下次不再提示，直接保存'),
      ]),
    ]),
    '运行配置',
    {
      confirmButtonText: '保存',
      cancelButtonText: '不保存',
      type: 'warning',
    }
  )
    .then(() => {
      if (neverAsk.value) {
        try {
          localStorage.setItem(NEVER_ASK_CONFIG_KEY, '1')
        } catch (e) {}
      }
      persistAndClose()
    })
    .catch(() => {
      // 用户点「不保存」或关闭确认框：恢复为打开时的配置
      discardAndClose()
    })
}

/* ================= Monaco 编辑器 ================= */
const editorEl = ref(null)
let editor = null
let suppressChange = false

function createEditor() {
  if (editor || !editorEl.value) return
  editor = monaco.editor.create(editorEl.value, {
    value: dicContent.value,
    language: 'nebula',
    theme: isDarkMode.value ? 'vs-dark' : 'vs',
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
    renderWhitespace: 'selection',
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    padding: { top: 8, bottom: 8 },
    // 关闭输入即弹出补全：仅 $ % # [ 触发字符与 Ctrl+Space 手动触发
    quickSuggestions: false,
    suggestOnTriggerCharacters: true,
  })
  // 编辑器内容变更同步到 dicContent 并缓存到本地
  editor.onDidChangeModelContent(() => {
    if (suppressChange) return
    dicContent.value = editor.getValue()
    contentDirty.value = true
    if (dicForm.value.path) {
      persistContentCache(dicForm.value.path, dicContent.value)
    }
    schedulePushHistory()
    // 实时保存：开启后编辑停顿自动写盘
    scheduleAutoSave()
  })
  // Ctrl/Cmd + S 保存词库
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

// 主题切换同步
watch(isDarkMode, (dark) => {
  editor?.updateOptions({ theme: dark ? 'vs-dark' : 'vs' })
})

/* ================= 词库内容本地缓存 ================= */
function contentCacheKey(path) {
  return 'nebula_dic_debug_content_' + encodeURIComponent(path)
}

function persistContentCache(path, content) {
  try {
    localStorage.setItem(contentCacheKey(path), content)
  } catch (e) {
    console.warn('缓存词库内容失败:', e)
  }
}

function getContentCache(path) {
  try {
    return localStorage.getItem(contentCacheKey(path))
  } catch (e) {
    return null
  }
}

function clearContentCache(path) {
  try {
    localStorage.removeItem(contentCacheKey(path))
  } catch (e) {
    console.warn('清除词库缓存失败:', e)
  }
}

/* ================= 词库内容编辑 ================= */
const dicContent = ref('')
const contentLoading = ref(false)
const contentDirty = ref(false)
const saving = ref(false)

/* ================= 编辑历史（上一步/下一步，持久化到本地） ================= */
const HISTORY_MAX = 50
const HISTORY_DEBOUNCE = 800
const canUndo = ref(false)
const canRedo = ref(false)
let history = { stack: [''], index: 0 }
let historyTimer = null

function historyKey(path) {
  return 'nebula_dic_debug_history_' + encodeURIComponent(path)
}

function loadHistory(path) {
  try {
    const raw = localStorage.getItem(historyKey(path))
    if (raw) {
      const h = JSON.parse(raw)
      if (Array.isArray(h.stack) && h.stack.length > 0 && typeof h.index === 'number') {
        return h
      }
    }
  } catch (e) {
    console.warn('读取编辑历史失败:', e)
  }
  return { stack: [''], index: 0 }
}

function saveHistory(path, h) {
  try {
    localStorage.setItem(historyKey(path), JSON.stringify(h))
  } catch (e) {
    console.warn('保存编辑历史失败:', e)
  }
}

function clearHistory(path) {
  try {
    localStorage.removeItem(historyKey(path))
  } catch (e) {
    console.warn('清除编辑历史失败:', e)
  }
}

function updateUndoState() {
  // 上一步：非第一步可撤销；或处于第一步但内容非空时也可撤销（回到初始空状态）
  canUndo.value =
    history.index > 0 || (history.index === 0 && history.stack[0] !== '')
  canRedo.value = history.index < history.stack.length - 1
}

function pushHistory(content) {
  if (history.stack[history.index] === content) return
  history.stack = history.stack.slice(0, history.index + 1)
  history.stack.push(content)
  if (history.stack.length > HISTORY_MAX) history.stack.shift()
  history.index = history.stack.length - 1
  saveHistory(dicForm.value.path, history)
  updateUndoState()
}

function schedulePushHistory() {
  clearTimeout(historyTimer)
  historyTimer = setTimeout(() => {
    if (dicForm.value.path && dicContent.value !== history.stack[history.index]) {
      pushHistory(dicContent.value)
    }
  }, HISTORY_DEBOUNCE)
}

function initHistory(path, currentContent) {
  history = loadHistory(path)
  if (history.stack[history.index] !== currentContent) {
    pushHistory(currentContent)
  } else {
    updateUndoState()
  }
}

// 撤销/重做后同步状态：更新本地缓存与修改标记（setEditorValue 会抑制 change 事件，需手动处理）
function syncAfterHistoryEdit() {
  contentDirty.value = true
  if (dicForm.value.path) {
    persistContentCache(dicForm.value.path, dicContent.value)
  }
  saveHistory(dicForm.value.path, history)
  updateUndoState()
}

function undoContent() {
  if (history.index <= 0) return
  history.index--
  setEditorValue(history.stack[history.index])
  syncAfterHistoryEdit()
}

function redoContent() {
  if (history.index >= history.stack.length - 1) return
  history.index++
  setEditorValue(history.stack[history.index])
  syncAfterHistoryEdit()
}

// 重置为文件内容：清除本地缓存并重新读取词库文件
async function handleReset() {
  const path = dicForm.value.path
  if (!path) return
  clearContentCache(path)
  clearHistory(path)
  contentLoading.value = true
  try {
    const data = await apiPost({ type: 'dic_get_content', data: { path } })
    setEditorValue(data.content || '')
    contentDirty.value = false
    initHistory(path, dicContent.value)
    ElMessage.success('已重置为文件内容')
  } catch (e) {
    console.warn('重置失败:', e)
    ElMessage.error('重置失败: ' + (e.message || '未知错误'))
  } finally {
    contentLoading.value = false
  }
}

async function loadDicContent(path) {
  if (!path) {
    setEditorValue('')
    contentDirty.value = false
    return
  }
  // 优先恢复本地缓存（未保存的编辑），避免丢失
  const cached = getContentCache(path)
  if (cached !== null) {
    setEditorValue(cached)
    contentDirty.value = true
    initHistory(path, cached)
    ElMessage({
      message: '已恢复上次未保存的编辑内容',
      type: 'info',
      duration: 0,
      showClose: true,
      action: h('span', { class: 'cache-reset-btn', onClick: () => handleReset(path) }, '重置'),
    })
    return
  }
  contentLoading.value = true
  try {
    const data = await apiPost({ type: 'dic_get_content', data: { path } })
    setEditorValue(data.content || '')
    initHistory(path, dicContent.value)
  } catch (e) {
    // 文件不存在视为新词库，允许直接编辑
    console.warn('读取词库内容失败:', e)
    setEditorValue('')
    initHistory(path, '')
  } finally {
    contentDirty.value = false
    contentLoading.value = false
  }
}

/* ================= 实时保存 ================= */
const AUTO_SAVE_DEBOUNCE = 1000
let autoSaveTimer = null

// 编辑停顿后自动写入词库文件（不触发运行、不弹提示）
function scheduleAutoSave() {
  clearTimeout(autoSaveTimer)
  if (!autoSave.value) return
  autoSaveTimer = setTimeout(() => {
    if (dicForm.value.path.trim() && contentDirty.value) {
      doAutoSave()
    }
  }, AUTO_SAVE_DEBOUNCE)
}

async function doAutoSave() {
  const path = dicForm.value.path.trim()
  if (!path) return
  try {
    await apiPost({
      type: 'dic_save_content',
      data: { path, content: dicContent.value },
    })
    contentDirty.value = false
    clearContentCache(path)
    // 与「保存运行」配合：自动保存完成后也自动运行，实时查看效果
    if (saveRun.value) {
      // 保持页面停留在原地，避免结果区更新引起的滚动跳动
      const scrollY = window.scrollY
      await runDic(true)
      window.scrollTo(0, scrollY)
    }
  } catch (e) {
    // 自动保存失败不打扰用户，继续编辑会再次触发重试
    console.warn('自动保存词库失败:', e)
  }
}

async function saveContent() {
  if (!dicForm.value.path.trim()) {
    ElMessage.warning('请先选择词库文件')
    return
  }
  saving.value = true
  try {
    await apiPost({
      type: 'dic_save_content',
      data: { path: dicForm.value.path.trim(), content: dicContent.value },
    })
    contentDirty.value = false
    clearContentCache(dicForm.value.path.trim())
    ElMessage.success('词库已保存')
    // 保存运行：开启后保存完成自动运行（内容已保存，跳过重复保存）
    if (saveRun.value) {
      // 保持页面停留在原地，避免结果区更新引起的滚动跳动
      const scrollY = window.scrollY
      await runDic(true)
      window.scrollTo(0, scrollY)
    }
  } catch (e) {
    ElMessage.error('保存失败: ' + (e.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

/* ================= 运行结果 ================= */
const result = ref(null)
const runError = ref('')
const expandedVars = ref({})
// 变量区域整个卡片折叠（仅手机端显示折叠功能，默认收起）
const varsCollapsed = ref(false)
// 变量面板内容区 DOM（用于高度动画）
const varsBodyEl = ref(null)

// 展开/收起弹性动画：展开用 back 缓动（轻微过冲），收起用标准缓动
function toggleVarsPanel() {
  const el = varsBodyEl.value
  if (!el) return
  const opening = varsCollapsed.value
  // 清除可能遗留的过渡，避免抖动
  el.style.transition = 'none'
  el.style.overflow = 'hidden'
  if (opening) {
    // 展开：先置 0，双 rAF 后设置过渡与目标高度，确保浏览器触发动画
    el.style.height = '0px'
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'height 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)'
        el.style.height = el.scrollHeight + 'px'
        varsCollapsed.value = false
      })
    })
  } else {
    // 收起
    el.style.height = el.scrollHeight + 'px'
    void el.offsetHeight
    el.style.transition = 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    el.style.height = '0px'
    varsCollapsed.value = true
  }
  const onEnd = () => {
    el.style.transition = 'none'
    el.style.overflow = ''
    // 展开动画结束后恢复为自适应高度，保证内容完整显示
    if (!varsCollapsed.value) el.style.height = 'auto'
    el.removeEventListener('transitionend', onEnd)
  }
  el.addEventListener('transitionend', onEnd, { once: true })
}

// 变量值超长折叠：超过 100 字符显示省略并支持展开/收起
const VAR_LIMIT = 100

function varKey(scope, key) {
  return scope + ':' + key
}

function isVarExpanded(scope, key) {
  return !!expandedVars.value[varKey(scope, key)]
}

function toggleVar(scope, key) {
  const k = varKey(scope, key)
  expandedVars.value[k] = !expandedVars.value[k]
}

function isVarLong(val) {
  const s = val && val.v
  return typeof s === 'string' && s.length > VAR_LIMIT
}

function displayVarVal(scope, key, val) {
  const s = val && val.v !== undefined ? val.v : String(val)
  if (isVarExpanded(scope, key) || !isVarLong(val)) return s
  return s.slice(0, VAR_LIMIT) + '…'
}

// 解析全局变量列表（每项 key=value，# 开头为注释）
function parseGInput(gVars) {
  const g = {}
  for (const item of gVars || []) {
    const t = String(item).trim()
    if (!t || t.startsWith('#')) continue
    const idx = t.indexOf('=')
    if (idx <= 0) continue
    // 值保持原样（可能包含换行），不做 trim
    g[t.slice(0, idx).trim()] = t.slice(idx + 1)
  }
  return g
}

// 全局变量标签展示：值中的换行显示为 ⏎，超长截断（完整内容见悬浮 title）
function displayGItem(item) {
  const eq = item.indexOf('=')
  const key = eq > 0 ? item.slice(0, eq) : item
  const val = eq > 0 ? item.slice(eq + 1) : ''
  const flat = val.replace(/\r?\n/g, '⏎')
  const shown = flat.length > 20 ? flat.slice(0, 20) + '…' : flat
  return key + '=' + shown
}

// 添加全局变量标签（键名 + 键值两个输入框）
function addGVar() {
  const key = gKeyInput.value.trim()
  // 值允许包含换行/空格，仅去掉末尾多余的空白
  const value = gValueInput.value.replace(/\s+$/, '')
  if (!key) {
    ElMessage.warning('键名不能为空')
    return
  }
  // 键名规范：仅中文、字母、数字、下划线
  if (!/^[一-龥A-Za-z0-9_]+$/.test(key)) {
    ElMessage.warning('键名只能包含中文、字母、数字和下划线')
    return
  }
  // __ 前缀保留给系统全局变量
  if (key.startsWith('__')) {
    ElMessage.warning('键名不能以 __ 开头（系统保留）')
    return
  }
  const item = key + '=' + value
  if (dicForm.value.g.includes(item)) {
    ElMessage.warning('该变量已存在')
    return
  }
  dicForm.value.g.push(item)
  gKeyInput.value = ''
  gValueInput.value = ''
}

// 删除全局变量标签
function removeGVar(idx) {
  dicForm.value.g.splice(idx, 1)
}

// 点击标签进入编辑：拆分回填到输入框并移除原标签，修改后点「添加」重新加入
function editGVar(idx) {
  const item = dicForm.value.g[idx]
  if (!item) return
  const eq = item.indexOf('=')
  gKeyInput.value = eq > 0 ? item.slice(0, eq) : item
  gValueInput.value = eq > 0 ? item.slice(eq + 1) : ''
  dicForm.value.g.splice(idx, 1)
  nextTick(() => gKeyInputEl.value?.focus())
}

async function runDic(skipSave = false) {
  if (!dicForm.value.path.trim()) {
    ElMessage.warning('请先选择词库文件')
    return
  }
  running.value = true
  runError.value = ''
  try {
    // 实时生效：运行前自动保存当前编辑的词库内容（由保存运行触发时已保存过，跳过）
    if (!skipSave) {
      await apiPost({
        type: 'dic_save_content',
        data: { path: dicForm.value.path.trim(), content: dicContent.value },
      })
      contentDirty.value = false
      clearContentCache(dicForm.value.path.trim())
    }
    const data = await apiPost({
      type: 'dic_debug_run',
      data: {
        path: dicForm.value.path.trim(),
        trigger: dicForm.value.trigger,
        g: parseGInput(dicForm.value.g),
        timeout: Number(dicForm.value.timeout) || 0,
      },
    })
    result.value = data
    // 超时：提示用户词库执行被强行打断
    if (data && data.timedOut) {
      ElMessage.warning('词库执行超时，已强制中断')
    }
  } catch (e) {
    console.error('词库运行失败:', e)
    runError.value = e.message || '词库运行失败'
    result.value = null
  } finally {
    running.value = false
  }
}

// 是否支持复制图片（需要 ClipboardItem 剪贴板图片 API，仅 Chromium 内核支持）
const canCopyImage = !!(navigator.clipboard && window.ClipboardItem)

// 从图片地址读取图片 Blob（支持 data URI / http(s) 地址）；失败返回 null
async function fetchImageBlob(src) {
  try {
    const resp = await fetch(src)
    if (!resp.ok) return null
    const blob = await resp.blob()
    if (blob.type && blob.type.startsWith('image/')) return blob
    return null
  } catch {
    return null
  }
}

// 兜底：把图片绘制到 canvas 再导出 PNG Blob（部分环境对 data URI 直接 fetch 不生效）
function canvasImageBlob(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0)
        canvas.toBlob((b) => resolve(b), 'image/png')
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// 把单张图片写入剪贴板（fetch Blob 优先，canvas 兜底）
async function writeImageToClipboard(src) {
  let blob = await fetchImageBlob(src)
  if (!blob) blob = await canvasImageBlob(src)
  if (!blob) throw new Error('无法读取图片数据')
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
}

// 复制运行输出：仅复制文本，图片位置用 [图片] 占位；图片需单独用「复制图片」按钮复制
async function copyOutput() {
  const r = result.value
  if (!r) return
  const text = outputSegments.value
    .map((s) => (s.type === 'img' ? '[图片]' : s.text))
    .join('')
  try {
    if (!text) {
      ElMessage.warning('没有可复制的内容')
      return
    }
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制到剪贴板')
  } catch (e) {
    console.warn('复制失败:', e)
    ElMessage.error('复制失败: ' + (e.message || '未知错误'))
  }
}

// 复制输出中的单张图片到剪贴板
async function copyImage(src) {
  try {
    await writeImageToClipboard(src)
    ElMessage.success('图片已复制到剪贴板')
  } catch (e) {
    console.warn('复制图片失败:', e)
    ElMessage.error('复制图片失败: ' + (e.message || '未知错误'))
  }
}

// 触摸图片时显示右上角「复制图片」按钮（触摸别处自动隐藏；桌面端用 hover 显示）
function onImgTouchStart(e) {
  e.stopPropagation()
  e.currentTarget.classList.add('img-btn-show')
}
function onDocTouchStart(e) {
  document.querySelectorAll('.output-img-wrap.img-btn-show').forEach((wrap) => {
    if (!wrap.contains(e.target)) wrap.classList.remove('img-btn-show')
  })
}

// 解析输出文本中的图片标记为分段（旧后端无 segments 时的兜底）：±img= / <img src> / ![alt](url)
const OUTPUT_IMG_RE = /±img=([^±]+)±|<img[^>]*\bsrc=["']([^"']+)["'][^>]*>|!\[[^\]]*\]\(([^)\s]+)\)/g

function parseOutputSegments(text) {
  if (!text) return []
  const segs = []
  let last = 0
  let m
  OUTPUT_IMG_RE.lastIndex = 0
  while ((m = OUTPUT_IMG_RE.exec(text))) {
    if (m.index > last) segs.push({ type: 'text', text: text.slice(last, m.index) })
    const src = m[1] || m[2] || m[3] || ''
    segs.push({ type: 'img', src })
    last = m.index + m[0].length
  }
  if (last < text.length) segs.push({ type: 'text', text: text.slice(last) })
  if (!segs.length) segs.push({ type: 'text', text })
  return segs
}

// 运行输出分段（支持图片显示）：优先使用后端解析结果
const outputSegments = computed(() => {
  const r = result.value
  if (!r) return []
  if (Array.isArray(r.segments)) return r.segments
  return parseOutputSegments(String(r.output || ''))
})

/* ================= 切换词库时重新加载内容 ================= */
watch(
  () => dicForm.value.path,
  (path) => {
    // 归一化路径：去掉首尾空格，避免缓存/历史键与保存路径不一致
    const p = (path || '').trim()
    if (p !== path) {
      dicForm.value.path = p
      return
    }
    if (p) {
      loadDicContent(p)
      // 切换词库后清除上次结果
      result.value = null
      runError.value = ''
    }
  }
)

/* ================= 初始化 ================= */
onMounted(() => {
  loadConfig()
  createEditor()
  // 触摸图片外区域时隐藏「复制图片」按钮
  document.addEventListener('touchstart', onDocTouchStart, { passive: true })
  // 仅手机端默认折叠变量区域；电脑端保持展开显示
  if (isMobile.value) {
    varsCollapsed.value = true
    // 内容区高度置 0，避免折叠状态下内容撑开面板
    if (varsBodyEl.value) varsBodyEl.value.style.height = '0px'
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('touchstart', onDocTouchStart)
  clearTimeout(historyTimer)
  clearTimeout(autoSaveTimer)
  clearTimeout(dicSearchTimer)
  editor?.dispose()
  editor = null
})
</script>

<template>
  <div class="page">
    <div class="page-header page-header-flex">
      <div class="page-header-info">
        <h2 class="page-title">词库调试</h2>
        <p class="page-subtitle">实时编辑词库并运行查看输出结果与变量</p>
      </div>
      <ElButton type="primary" :icon="Setting" @click="configVisible = true">
        运行配置
      </ElButton>
    </div>

    <!-- 运行配置弹窗 -->
    <ElDialog
      v-model="configVisible"
      title="运行配置"
      :width="isMobile ? '92%' : 480"
      destroy-on-close
      :before-close="handleConfigClose"
    >
      <ElForm :model="dicForm" :label-position="isMobile ? 'top' : 'right'">
        <ElFormItem label="词库文件">
          <div class="path-row">
            <ElSelect
              v-model="dicForm.path"
              filterable
              remote
              :remote-method="searchDicFiles"
              allow-create
              :loading="searchLoading"
              placeholder="选择或输入词库路径，输入关键字可搜索过滤"
              style="flex: 1"
            >
              <ElOption
                v-for="file in dicFiles"
                :key="file"
                :label="file"
                :value="file"
              />
            </ElSelect>
          </div>
        </ElFormItem>

        <ElFormItem label="保存方式">
          <div class="auto-run-inline">
            <ElSwitch v-model="saveRun" />
            <span class="auto-run-label">保存运行</span>
            <ElSwitch v-model="autoSave" />
            <span class="auto-run-label">实时保存</span>
          </div>
        </ElFormItem>

        <ElFormItem label="触发文本">
          <ElInput
            v-model="dicForm.trigger"
            type="textarea"
            :rows="3"
            placeholder="请输入触发文本，例如：你好"
          />
        </ElFormItem>

        <ElFormItem label="超时限制">
          <ElInputNumber
            v-model="dicForm.timeout"
            :min="0"
            :max="3600"
            :step="1"
            :controls="false"
            style="width: 120px"
          />
          <span class="timeout-hint">秒，0 表示不限时</span>
        </ElFormItem>

        <ElFormItem label="全局变量">
          <div class="g-tag-wrap">
            <div class="g-tag-input">
              <ElInput
                ref="gKeyInputEl"
                v-model="gKeyInput"
                size="small"
                placeholder="键名（中文/字母/数字/下划线）"
                @keyup.enter="addGVar"
              />
              <ElInput
                v-model="gValueInput"
                type="textarea"
                :autosize="{ minRows: 1, maxRows: 3 }"
                resize="none"
                size="small"
                placeholder="键值（可包含换行）"
                @keydown.ctrl.enter.prevent="addGVar"
              />
              <ElButton size="small" type="primary" @click="addGVar">
                添加
              </ElButton>
            </div>
            <div v-if="dicForm.g.length" class="g-tag-list">
              <ElTag
                v-for="(item, idx) in dicForm.g"
                :key="idx"
                closable
                :title="item"
                @close="removeGVar(idx)"
                @click="editGVar(idx)"
              >
                {{ displayGItem(item) }}
              </ElTag>
            </div>
          </div>
        </ElFormItem>
      </ElForm>
    </ElDialog>

    <!-- 词库内容 + 变量 -->
    <div class="panel-card">
      <div class="card-title-row">
        <h3 class="card-title">词库内容</h3>
        <div class="content-actions">
          <span v-if="contentDirty" class="dirty-tip">内容已修改，运行前将自动保存</span>
          <ElButton
            :icon="ArrowLeftBold"
            :disabled="!canUndo"
            @click="undoContent"
          >
            上一步
          </ElButton>
          <ElButton
            :icon="ArrowRightBold"
            :disabled="!canRedo"
            @click="redoContent"
          >
            下一步
          </ElButton>
          <ElButton
            type="primary"
            :icon="VideoPlay"
            :loading="running"
            @click="runDic"
          >
            运行词库
          </ElButton>
          <!-- 实时保存开启时由编辑自动写盘，隐藏手动保存按钮 -->
          <ElButton
            v-if="!autoSave"
            type="success"
            :icon="DocumentChecked"
            :loading="saving"
            @click="saveContent"
          >
            保存词库
          </ElButton>
        </div>
      </div>
      <div class="editor-vars-layout">
        <!-- 左侧：编辑器 -->
        <div ref="editorEl" class="dic-editor" />

        <!-- 右侧：变量（仅手机端支持整卡折叠，电脑端始终展开） -->
        <div class="vars-panel" :class="{ collapsed: varsCollapsed }">
          <!-- 折叠头部：仅手机端显示 -->
          <div v-if="isMobile" class="vars-panel-header" @click="toggleVarsPanel">
            <span class="vars-panel-title">变量</span>
            <el-icon class="vars-panel-toggle">
              <ArrowDown v-if="varsCollapsed" />
              <ArrowUp v-else />
            </el-icon>
          </div>
          <!-- 高度由 JS 控制以实现弹性展开/收起动画 -->
          <div ref="varsBodyEl" class="vars-panel-body">
            <div class="vars-col">
              <div class="vars-col-title">局部变量</div>
              <div v-if="Object.keys(result?.vars?.P || {}).length" class="vars-box">
                <div
                  v-for="(val, key) in result.vars.P"
                  :key="'P:' + key"
                  class="var-row"
                >
                  <span class="var-key">{{ key }}</span>
                  <ElTag class="var-type" size="small" type="info">{{ val.t || '未知' }}</ElTag>
                  <div class="var-val-wrap">
                    <span class="var-val">{{ displayVarVal('P', key, val) }}</span>
                    <ElButton
                      v-if="isVarLong(val)"
                      class="var-toggle"
                      link
                      type="primary"
                      size="small"
                      @click="toggleVar('P', key)"
                    >
                      {{ isVarExpanded('P', key) ? '收起' : '展开' }}
                    </ElButton>
                  </div>
                </div>
              </div>
              <div v-else class="vars-empty">
                <ElEmpty description="暂无局部变量" :image-size="60" />
              </div>
            </div>
            <div class="vars-col">
              <div class="vars-col-title">全局变量</div>
              <div v-if="Object.keys(result?.vars?.G || {}).length" class="vars-box">
                <div
                  v-for="(val, key) in result.vars.G"
                  :key="'G:' + key"
                  class="var-row"
                >
                  <span class="var-key">{{ key }}</span>
                  <ElTag class="var-type" size="small" type="info">{{ val.t || '未知' }}</ElTag>
                  <div class="var-val-wrap">
                    <span class="var-val">{{ displayVarVal('G', key, val) }}</span>
                    <ElButton
                      v-if="isVarLong(val)"
                      class="var-toggle"
                      link
                      type="primary"
                      size="small"
                      @click="toggleVar('G', key)"
                    >
                      {{ isVarExpanded('G', key) ? '收起' : '展开' }}
                    </ElButton>
                  </div>
                </div>
              </div>
              <div v-else class="vars-empty">
                <ElEmpty description="暂无全局变量" :image-size="60" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="form-hint">
        支持词库语法实时编辑：修改后点击「运行词库」或「保存词库」即可生效，无需重启服务（Ctrl+S 保存）
      </div>
    </div>

    <!-- 运行输出 -->
    <div class="output-zone">
      <ElButton
        v-if="result && !runError"
        class="copy-btn"
        size="small"
        type="primary"
        plain
        @click="copyOutput"
      >
        复制
      </ElButton>
      <div v-if="runError" class="error-box">{{ runError }}</div>
      <div v-else-if="result" class="output-text">
        <template v-for="(seg, idx) in outputSegments" :key="idx">
          <span v-if="seg.type === 'text'">{{ seg.text }}</span>
          <div v-else class="output-img-wrap" @touchstart="onImgTouchStart">
            <img
              :src="seg.src"
              class="output-img"
              :alt="'词库图片'"
              :title="seg.src"
            />
            <ElButton
              v-if="canCopyImage"
              class="img-copy-btn"
              size="small"
              plain
              @click.stop="copyImage(seg.src)"
            >
              复制图片
            </ElButton>
          </div>
        </template>
      </div>
      <div v-else class="output-placeholder">
        <ElEmpty description="选择词库并输入触发文本后点击运行" :image-size="60" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ElMessage 中「重置」按钮（消息渲染在 body，需 :global 命中） */
:global(.cache-reset-btn) {
  margin-left: 10px;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--el-color-primary);
  border: 1px solid var(--el-color-primary);
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s;
}

:global(.cache-reset-btn:hover) {
  background-color: var(--el-color-primary-light-9);
}

.page {
  width: 100%;
}

.page-header {
  margin-bottom: 24px;
}

.page-header-flex {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.panel-card {
  min-width: 0;
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

.card-title {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.card-title-row .card-title {
  margin-bottom: 0;
}

.content-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dirty-tip {
  font-size: 12px;
  color: var(--el-color-warning);
}

.dic-editor {
  box-sizing: border-box;
  width: 100%;
  height: 520px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}

.editor-vars-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  align-items: start;
}

.vars-panel {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 520px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow-y: auto;
  background: var(--el-fill-color-blank);
}

/* 折叠时只保留头部高度（需覆盖移动端 media 的 min-height，否则会撑出空白） */
.vars-panel.collapsed {
  height: auto;
  min-height: 0;
  overflow: hidden;
}

.vars-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  cursor: pointer;
  user-select: none;
}

.vars-panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.vars-panel-toggle {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.vars-panel-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  /* 折叠动画期间裁剪内容；展开结束后高度恢复 auto 不影响显示 */
  overflow: hidden;
}

.vars-panel .vars-box {
  max-height: none;
}

.dic-file-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
}

.dic-file-row .path-row {
  flex: 1;
}

.auto-run-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.path-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.g-tag-wrap {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.g-tag-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}

.g-tag-list .el-tag {
  cursor: pointer;
}

.g-tag-input {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.g-tag-input .el-input,
.g-tag-input .el-textarea {
  flex: 1;
}

.auto-run-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.auto-run-label {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.timeout-hint {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 关闭运行配置弹窗时的保存确认框 */
.config-save-confirm {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.config-save-text {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-regular);
}
.config-save-ask {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  user-select: none;
}
.config-save-ask input {
  cursor: pointer;
}

/* ==================== 运行结果 ==================== */
.error-box {
  padding: 12px 16px;
  border: 1px solid var(--el-color-danger-light-5);
  background: var(--el-color-danger-light-9);
  border-radius: 8px;
  color: var(--el-color-danger);
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 输出区域：固定高度 */
.output-zone {
  position: relative;
  margin-top: 16px;
  height: 240px;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-light);
}

.copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
}

.output-text {
  padding: 12px 72px 12px 16px;
  font-size: 13px;
  font-family: 'JetBrains Mono', Consolas, 'Courier New', monospace;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  word-break: break-all;
  min-height: 100%;
  box-sizing: border-box;
}

.output-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  box-sizing: border-box;
}

.output-img-wrap {
  position: relative;
  display: block;
  width: fit-content;
  max-width: 100%;
  margin: 6px 0;
}

.output-img-wrap .output-img {
  margin: 0;
}

/* 复制图片按钮默认隐藏，hover 图片（桌面）或触摸图片（触屏）时显示，叠加在图片右上角 */
.img-copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
  background-color: rgba(255, 255, 255, 0.9);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}

.output-img-wrap:hover .img-copy-btn,
.output-img-wrap.img-btn-show .img-copy-btn {
  opacity: 1;
  pointer-events: auto;
}

.output-img {
  display: block;
  max-width: 100%;
  max-height: 280px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color);
}

.vars-col-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.vars-box {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  max-height: 320px;
  overflow-y: auto;
}

.var-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 12px;
  font-size: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.var-row:last-child {
  border-bottom: none;
}

.var-key {
  flex-shrink: 0;
  color: var(--el-color-primary);
  font-weight: 600;
}

.var-type {
  flex-shrink: 0;
  margin-top: 1px;
  font-size: 11px;
}

.var-val-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}

.var-val {
  color: var(--el-text-color-regular);
  word-break: break-all;
  white-space: pre-wrap;
}

.var-toggle {
  padding: 0;
  height: auto;
  font-size: 11px;
}

.vars-empty {
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  padding: 8px;
}

@media (max-width: 768px) {
  .panel-card {
    padding: 20px 16px;
  }

  .page-title {
    font-size: 18px;
  }

  .editor-vars-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  /* 编辑器与变量面板高度随视口自适应 */
  .dic-editor,
  .vars-panel {
    height: 50vh;
    min-height: 300px;
  }

  .dic-file-row {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .auto-run-inline {
    justify-content: flex-end;
  }

  .card-title-row {
    flex-direction: column;
    align-items: flex-start;
  }

  /* 操作按钮：2 列网格布局，避免一行溢出 */
  .content-actions {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .content-actions .el-button {
    width: 100%;
    margin-left: 0;
  }

  .dirty-tip {
    grid-column: 1 / -1;
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

  .page-header-flex {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .page-header-flex > .el-button {
    width: 100%;
    margin-left: 0;
  }

  .page-title {
    font-size: 16px;
  }

  .page-subtitle {
    font-size: 12px;
  }

  .dic-editor,
  .vars-panel {
    height: 45vh;
    min-height: 260px;
  }

  .output-zone {
    height: 200px;
  }

  /* 全局变量输入：两输入框与按钮改为纵向排列 */
  .g-tag-input {
    flex-direction: column;
    align-items: stretch;
  }

  .g-tag-input .el-input,
  .g-tag-input .el-textarea {
    flex: none;
    width: 100%;
  }

  .g-tag-input .el-button {
    align-self: flex-end;
    width: 100%;
  }
}
</style>
