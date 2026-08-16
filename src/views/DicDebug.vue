<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, inject, h, nextTick } from 'vue'
import { DocumentChecked, Setting, VideoPlay, ArrowLeftBold, ArrowRightBold, ArrowDown, ArrowUp, FullScreen, Brush, Close, Plus } from '@element-plus/icons-vue'
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
import 'monaco-editor/esm/vs/editor/contrib/inlineCompletions/browser/inlineCompletions.contribution.js'
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
// 词库语法高亮自定义配色（JSON 配置）
import dicHighlight from '@/dicHighlight.json'

/* ================= Monaco Worker 配置 ================= */
self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker()
  },
}

/* ================= 注册词库语言高亮 ================= */
monaco.languages.register({ id: 'nebula' })
// 注释语法配置：Ctrl+/ 行注释（多行每行加 //）
monaco.languages.setLanguageConfiguration('nebula', {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
  },
})
// 构建 Monarch 分词器：root 顶部追加自定义正则（优先），其后为内置 tokens 规则
function buildNebulaTokenizer(customRules, tokens) {
  const customRoot = (customRules || []).map((r) => [new RegExp(r.regex), r.token])
  const pairs = ((tokens && tokens.pairs) || []).map((p, i) => ({ state: `pair${i}`, ...p }))
  const simpleRules = ((tokens && tokens.rules) || []).map((r) => [new RegExp(r.regex), r.token])

  const tokenizer = {
    root: [
      ...customRoot,
      ...pairs.map((p) => [new RegExp(p.open), p.token, `@${p.state}`]),
      ...simpleRules,
    ],
  }
  for (const p of pairs) {
    tokenizer[p.state] = [
      [new RegExp(p.close), p.token, '@pop'],
      ...p.content.map((c) => [new RegExp(c), p.token]),
    ]
  }
  return { defaultToken: '', tokenizer }
}

/* ================= 自定义语法高亮主题（JSON 配置） ================= */
const HIGHLIGHT_CONFIG_KEY = 'nebula_dic_highlight_config'
const HEX_COLOR_RE = /^#?([0-9A-Fa-f]{6})([0-9A-Fa-f]{2})?$/

// 校验并规范化 token 识别规则（正则）
function normalizeTokens(tokens) {
  const src = (tokens && typeof tokens === 'object' ? tokens : dicHighlight['分词规则']) || {}
  const rules = (Array.isArray(src['规则']) ? src['规则'] : []).map((r, i) => {
    if (!r || typeof r !== 'object' || typeof r['正则'] !== 'string' || !r['正则'] || typeof r['标记'] !== 'string' || !r['标记']) {
      throw new Error(`分词规则.规则[${i}] 需包含 正则 与 标记`)
    }
    try { new RegExp(r['正则']) } catch (e) { throw new Error(`分词规则.规则[${i}].正则 无效: ${e.message}`) }
    return { regex: r['正则'], token: r['标记'] }
  })
  const pairs = (Array.isArray(src['配对']) ? src['配对'] : []).map((p, i) => {
    if (!p || typeof p !== 'object' || typeof p['开始'] !== 'string' || !p['开始'] || typeof p['结束'] !== 'string' || !p['结束'] || typeof p['标记'] !== 'string' || !p['标记']) {
      throw new Error(`分词规则.配对[${i}] 需包含 开始、结束、标记`)
    }
    try { new RegExp(p['开始']) } catch (e) { throw new Error(`分词规则.配对[${i}].开始 无效: ${e.message}`) }
    try { new RegExp(p['结束']) } catch (e) { throw new Error(`分词规则.配对[${i}].结束 无效: ${e.message}`) }
    const content = (Array.isArray(p['内容']) ? p['内容'] : (typeof p['内容'] === 'string' && p['内容'] ? [p['内容']] : []))
      .map((c) => {
        if (typeof c !== 'string' || !c) throw new Error(`分词规则.配对[${i}].内容 必须是非空字符串`)
        try { new RegExp(c) } catch (e) { throw new Error(`分词规则.配对[${i}].内容 无效: ${e.message}`) }
        return c
      })
    if (!content.length) throw new Error(`分词规则.配对[${i}].内容 不能为空`)
    return { open: p['开始'], close: p['结束'], content, token: p['标记'] }
  })
  return { rules, pairs }
}

// 校验并补齐高亮配置，保证 defineTheme 所需字段齐全（颜色缺失会触发运行时异常）
// 说明：中文键只存在于配置 JSON 层，normalize 后统一转回 Monaco 所需的英文键（base/inherit/rules/colors/token/foreground）
function normalizeHighlightConfig(cfg) {
  if (!cfg || typeof cfg !== 'object' || !cfg['暗色主题'] || !cfg['亮色主题']) {
    throw new Error('配置必须包含 暗色主题 与 亮色主题 两个主题')
  }
  const normalizeTheme = (t, fallbackBase) => ({
    base: ['vs', 'vs-dark', 'hc-black', 'hc-light'].includes(t?.['基础主题']) ? t['基础主题'] : fallbackBase,
    inherit: t['继承默认'] !== false,
    rules: Array.isArray(t['规则']) ? t['规则'].map((r) => ({ token: r['标记'], foreground: r['前景色'] })) : [],
    colors: t['颜色'] && typeof t['颜色'] === 'object' ? t['颜色'] : {},
  })
  const rawCustom = Array.isArray(cfg['自定义规则']) ? cfg['自定义规则'] : []
  const customRules = rawCustom.map((r, i) => {
    if (!r || typeof r !== 'object') throw new Error(`自定义规则[${i}] 必须是对象`)
    if (typeof r['正则'] !== 'string' || !r['正则']) throw new Error(`自定义规则[${i}].正则 不能为空`)
    if (typeof r['颜色'] !== 'string' || !HEX_COLOR_RE.test(r['颜色'])) {
      throw new Error(`自定义规则[${i}].颜色 必须是 6 位十六进制色值（如 #FF5500）`)
    }
    try {
      new RegExp(r['正则'])
    } catch (e) {
      throw new Error(`自定义规则[${i}].正则 无效: ${e.message}`)
    }
    return { token: `custom.${i}`, regex: r['正则'], color: r['颜色'] }
  })
  return {
    dark: normalizeTheme(cfg['暗色主题'], 'vs-dark'),
    light: normalizeTheme(cfg['亮色主题'], 'vs'),
    tokens: normalizeTokens(cfg['分词规则'] ?? dicHighlight['分词规则']),
    customRules,
  }
}

function applyHighlightConfig(cfg) {
  const customColors = (cfg.customRules || []).map((r) => ({ token: r.token, foreground: r.color }))
  monaco.editor.defineTheme('nebula-dark', { ...cfg.dark, rules: [...cfg.dark.rules, ...customColors] })
  monaco.editor.defineTheme('nebula-light', { ...cfg.light, rules: [...cfg.light.rules, ...customColors] })
  monaco.languages.setMonarchTokensProvider('nebula', buildNebulaTokenizer(cfg.customRules || [], cfg.tokens))
}

// 读取已保存的原始高亮配置（用于弹窗展示），未保存则回退默认 JSON
function loadRawHighlightConfig() {
  try {
    const raw = localStorage.getItem(HIGHLIGHT_CONFIG_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) {
    /* 忽略非法存储 */
  }
  return dicHighlight
}

// 读取并规范化高亮配置，失败时回退默认
function loadHighlightConfig() {
  try {
    return normalizeHighlightConfig(loadRawHighlightConfig())
  } catch (e) {
    return normalizeHighlightConfig(dicHighlight)
  }
}

// 初始化高亮主题与分词器
try {
  applyHighlightConfig(loadHighlightConfig())
} catch (e) {
  applyHighlightConfig(normalizeHighlightConfig(dicHighlight))
}

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
  '线程变量', '临时写', '临时读', '变量', '存在变量', '全局变量', '锁变量', '变量文本', '创建字典',
  // 流程控制
  '判断值', '判断空值', '延迟', '捕获输出', '拦截输出', 'STOP', '重启', 'GC回收',
  // 文件操作
  '读', '写', '写文件', '读文件', '读文件_随机一行', '读文件_行数', '读文件行', '文件后缀', '存在文件', '存在文件夹',
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
  'AES_CBC加密', 'AES_CBC解密', 'AES_CFB加密', 'AES_CFB解密', 'AES_GCM加密', 'AES_GCM解密', 'AES_CTR加密', 'AES_CTR解密',
  // Ed25519
  'Ed25519种子大小', 'Ed25519生成密钥', 'Ed25519从种子生成密钥', 'Ed25519签名',
  'Ed25519验证签名', 'Ed25519公钥转换为Curve25519', 'Ed25519私钥转换为Curve25519',
  'Ed25519从Curve25519生成密钥',
  // 网络访问
  '新建访问', '访问', '访问POST', '访问转发',
  // 终端
  '创建终端', '创建Shell终端',
  // 数据库
  '新建mysql', '打开sqlite', '读sqlite', '写sqlite', '关闭数据库',
  'db_写', 'db_读', 'db_删除', 'db_删除文件', 'db_删除文件夹',
  // JSON
  'JSON解析', 'json解析', 'JSON判断', 'JSON存', 'JSON存字', 'JSON追加', 'JSON追加字',
  'JSON删', 'JSON存在', 'JSON长度', 'JSON美化', 'JSON重名解析',
  'JSON查找文本', 'JSON模糊查找文本', 'JSON正则查找文本',
  // HTML / Markdown
  'HTML解析', 'HTML文本', 'HTML编码', 'HTML解码', 'MD转HTML',
  // 画布绘图
  '绘图', '创建画布', '获取画笔颜色', '写图片', '读图片',
  // 其他
  '读配置', '写配置', 'GIF拆帧', '图片相似度', '排序', '范围', 'ZIP压缩', 'ZIP解压',
  '创建邮件', '主机', '时间戳格式化时间', '时间间隔', '腾讯接口', '取前字符', '取后字符',
  // bot 动态注入
  '获取账号', '搜索账号', '群单发', '群发', '群单发图', '群单发MD', '群单发语音',
  '群单发视频', '私聊', '私聊图', '发送文本', '发送MD', '发送视频', '发送语音', 'IMG', '调用',
  // 词库执行 / WebSocket（dic/registry.go）
  '执行词库', '执行词库文件', '回调', '执行PHP网页词库', '执行PHP网页词库文件',
  '执行网页词库', '执行网页词库文件', 'WS连接', 'WS断开', 'WS发送', '创建WS', '读词库', '写词库',
  '终端_监听执行',
]

// 无参数命令（插入时不带参数占位）
const DIC_NO_ARG_CMDS = new Set([
  'STOP', '重启', 'GC回收', '捕获输出', '拦截输出', 'Ed25519种子大小', 'Ed25519生成密钥',
])

// 对象方法映射：创建函数 -> 方法列表（$变量.方法$，来自各 Class 实例的 Fn）
// 供输入 $变量. 后按变量类型精确补全
const DIC_CLASS_METHODS = {
  '创建WS': ['设置跨域', '设置词库路径', '设置访问路径', '设置变量'],
  '新建访问': ['切换GET', '切换POST', '切换PUT', '切换DELETE', '切换PATCH', '切换HEAD', '切换OPTIONS', '禁用跳转', '启用跳转', '设置头部', '设置超时', 'POST', 'POST文件', '发送', '全部内容', '内容'],
  '创建终端': ['异步执行', '执行目录', '执行', '解码器', '变量', '断开', '输入'],
  '创建Shell终端': ['异步执行', '执行目录', '执行', '解码器', '变量', '断开', '输入'],
  '新建mysql': ['PING', '执行', '切换数据库', '写', '读', '删除文件', '删除文件夹', '关闭'],
  '打开sqlite': ['写', '读', '执行', '删除文件', '删除文件夹', '关闭'],
  '创建邮件': ['发送', '发送HTML'],
  '腾讯接口': ['调用'],
  '创建字典': ['设置', '获取'],
  '创建画布': ['获取', '旋转', '圆角', '灰度', '全图马赛克', '字体', '大小', '设置颜色', '文本', '点', '线', '喷漆', '波浪', '油漆桶', '方形', '方形描边', '椭圆', '椭圆描边', '圆形', '圆形描边', '多边形', '多边形描边', '图片', '圆弧', '随机点', '随机线条', '高斯模糊', '马赛克'],
}

// 全部对象方法（去重，用于无法推断变量类型时的回退补全）
const DIC_CLASS_ALL_METHODS = [...new Set(Object.values(DIC_CLASS_METHODS).flat())]

// 无参数对象方法（插入时不带参数占位）
const DIC_CLASS_NO_ARG_METHODS = new Set([
  '切换GET', '切换HEAD', '切换OPTIONS', '禁用跳转', '启用跳转', '全部内容', '内容',
  '异步执行', '断开', 'PING', '关闭', '灰度',
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

// 流程控制（> 前缀，对应 entry.go 中 >跳过 / >终止 / >跳行 等解析分支）
const DIC_FLOW_ITEMS = [
  ['>否则', '如果块：否则分支'],
  ['>否则如果:条件', '如果块：否则如果分支', '>否则如果:${1:条件}'],
  ['>跳过', '跳过当前循环/分支'],
  ['>终止', '终止整个词库执行'],
  ['>终止 消息', '终止并输出消息', '>终止 ${1:消息}'],
  ['>终止循环', '跳出循环>块'],
  ['>终止遍历', '跳出遍历>块'],
  ['>跳行(条件)>>偏移', '条件成立时跳转行', '>跳行(${1:条件})>>${2:偏移}'],
]

// 框声明（> 结尾，对应 entry.go 中 JSON>/文本>/纯文本>/函数>/如果>/遍历>/循环> 等框解析分支）
const DIC_BOX_ITEMS = [
  ['JSON>', 'JSON 框声明', 'JSON>${1:内容}'],
  ['文本>', '文本框声明', '文本>${1:内容}'],
  ['纯文本>', '纯文本框声明（不解析变量）', '纯文本>${1:内容}'],
  ['函数>', '函数框声明', '函数>${1:名称}'],
  ['如果>', '如果框声明', '如果>${1:条件}'],
  ['遍历>', '遍历框声明', '遍历>${1:变量}'],
  ['循环>', '循环框声明', '循环>${1:变量}'],
]

// 构造补全项
// noArg：是否无参数命令（省略则回退到本地硬编码 DIC_NO_ARG_CMDS 判断）
function cmdItem(name, noArg) {
  const isNoArg = noArg !== undefined ? noArg : DIC_NO_ARG_CMDS.has(name)
  return {
    label: name,
    kind: monaco.languages.CompletionItemKind.Function,
    detail: '词库命令',
    sortText: 'a' + name,
    // 闭合的 $ 直接字面输出（snippet 中结尾裸 $ 视为字面符号，避免 $$ 转义产生多余 $）
    insertText: isNoArg ? name + '$' : name + ' ${1:参数}$',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
  }
}

// 对象方法补全项（$变量.方法$）
function methodItem(name) {
  const isNoArg = DIC_CLASS_NO_ARG_METHODS.has(name)
  return {
    label: name,
    kind: monaco.languages.CompletionItemKind.Method,
    detail: '对象方法',
    sortText: 'a' + name,
    insertText: isNoArg ? name + '$' : name + ' ${1:参数}$',
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

// 判断光标前的触发字符（$ 命令、% 变量、# 段、[ 前缀、> 流程/框）
function detectTrigger(model, position) {
  const line = model.getLineContent(position.lineNumber)
  const before = line.slice(0, position.column - 1)
  for (let i = before.length - 1; i >= 0; i--) {
    const ch = before[i]
    if (ch === '$') return 'cmd'
    if (ch === '%') return 'var'
    if (ch === '#') return 'kw'
    if (ch === '[') return 'prefix'
    if (ch === '>') return 'flow'
    // 遇到空格/制表符说明进入参数区，不再向前匹配
    if (ch === ' ' || ch === '\t') break
  }
  return 'all'
}

// 判断光标前是否为 $变量. 形式（对象方法调用），是则返回变量名，否则返回 null
function detectClassMethodTrigger(model, position) {
  const line = model.getLineContent(position.lineNumber)
  const before = line.slice(0, position.column - 1)
  const m = before.match(/\$([^\s$%#\[.]+)\.$/)
  return m ? m[1] : null
}

// 扫描全文，推断「变量 -> 创建函数」映射（识别 变量:...$创建函数 形式）
function buildClassVarMap(model) {
  const map = new Map()
  const text = model.getValue()
  const re = /([A-Za-z0-9_\u4e00-\u9fa5]+)\s*:\s*\$([^\s$%]+)/g
  let m
  while ((m = re.exec(text)) !== null) {
    if (DIC_CLASS_METHODS[m[2]]) {
      map.set(m[1], m[2])
    }
  }
  return map
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

// 计算 > 触发补全的替换范围：覆盖从本 token 起点到光标。
// > 既作前缀（流程控制 >终止）也作后缀（框声明 JSON>），统一替换整个 token
// 可避免补全后残留重复的 > 或框关键字（如 >>终止、JSONJSON>）。
function getFlowReplaceRange(model, position) {
  const line = model.getLineContent(position.lineNumber)
  const before = line.slice(0, position.column - 1)
  let tokenStart = 0
  for (let i = before.length - 1; i >= 0; i--) {
    if (before[i] === ' ' || before[i] === '\t') {
      tokenStart = i + 1
      break
    }
  }
  return new monaco.Range(position.lineNumber, tokenStart + 1, position.lineNumber, position.column)
}

// 从后端实时拉取的已注册函数列表；加载成功则优先使用，失败时回退到上面的硬编码列表
const dicFuncs = ref([])

async function loadDicFuncs() {
  try {
    const data = await apiPost({ type: 'get_dic_funcs' })
    if (data && Array.isArray(data.cmds)) {
      dicFuncs.value = data.cmds
    }
  } catch (e) {
    console.warn('读取词库函数列表失败，回退本地补全:', e)
  }
}

// 注册词库补全：$ 命令、% 变量、# 段标记、[ 前缀标记、. 对象方法、> 流程/框
monaco.languages.registerCompletionItemProvider('nebula', {
  triggerCharacters: ['$', '%', '#', '[', '.', '>'],
  provideCompletionItems(model, position, context) {
    const triggerChar = context?.triggerCharacter
    // 对象方法调用：$变量. 后按变量类型精确补全方法
    const classVarName = detectClassMethodTrigger(model, position)
    if (classVarName !== null) {
      const classVarMap = buildClassVarMap(model)
      const createFn = classVarMap.get(classVarName)
      const methods = createFn ? DIC_CLASS_METHODS[createFn] || DIC_CLASS_ALL_METHODS : DIC_CLASS_ALL_METHODS
      return { suggestions: methods.map(methodItem) }
    }
    // 其它位置的 . 不触发补全
    if (triggerChar === '.') {
      return { suggestions: [] }
    }
    const isTriggerChar =
      context?.triggerKind === monaco.languages.CompletionTriggerKind.TriggerCharacter
    // 字符触发时按触发类型过滤候选；非触发字符时显示全部
    const trigger = isTriggerChar ? detectTrigger(model, position) : 'all'
    // 替换范围：仅 [ 前缀、# 段触发时需要覆盖已输入的触发字符
    const insertRange = getReplaceRange(model, position, trigger)
    const flowRange = trigger === 'flow' ? getFlowReplaceRange(model, position) : undefined
    const text = model.getValue()
    const items = []

    const showCmd = trigger === 'all' || trigger === 'cmd'
    const showVar = trigger === 'all' || trigger === 'var'
    const showKw = trigger === 'all' || trigger === 'kw'
    const showPrefix = trigger === 'all' || trigger === 'prefix'
    const showFlow = trigger === 'all' || trigger === 'flow'

    // 命令
    if (showCmd) {
      const funcs = dicFuncs.value
      if (Array.isArray(funcs) && funcs.length) {
        // 后端实时列表：名称与无参标记均来自注册表
        for (const f of funcs) {
          if (f && f.name) items.push(cmdItem(f.name, !!f.no_arg))
        }
      } else {
        // 后端未加载成功时回退本地硬编码列表
        for (const name of DIC_CMDS_FLAT) {
          items.push(cmdItem(name))
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

    // 流程控制与框声明（> 触发）
    if (showFlow) {
      for (const [name, detail, insert] of DIC_FLOW_ITEMS) {
        items.push(kwItem(name, detail, insert))
      }
      for (const [name, detail, insert] of DIC_BOX_ITEMS) {
        items.push(kwItem(name, detail, insert))
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
    if (flowRange) {
      for (const item of items) item.range = flowRange
    } else if (insertRange) {
      for (const item of items) item.range = insertRange
    }

    return { suggestions: items }
  },
})

/* ================= 虚影文字补全（ghost text / inline suggest） ================= */
// 收集全部命令候选（后端实时列表优先，失败回退本地硬编码）
function collectCmdCandidates() {
  const funcs = dicFuncs.value
  if (Array.isArray(funcs) && funcs.length) {
    return funcs.map((f) => ({ name: f.name, noArg: !!f.no_arg }))
  }
  const out = []
  for (const name of DIC_CMDS_FLAT) out.push({ name, noArg: DIC_NO_ARG_CMDS.has(name) })
  return out
}

// 判断光标前的虚影补全上下文：触发类型 + 已输入前缀 + 触发字符下标
function detectInlineContext(model, position) {
  const line = model.getLineContent(position.lineNumber)
  const before = line.slice(0, position.column - 1)
  for (let i = before.length - 1; i >= 0; i--) {
    const ch = before[i]
    if (ch === '$') return { type: 'cmd', prefix: before.slice(i + 1), startIdx: i }
    if (ch === '%') return { type: 'var', prefix: before.slice(i + 1), startIdx: i }
    if (ch === '#') return { type: 'kw', prefix: before.slice(i + 1), startIdx: i }
    if (ch === '[') return { type: 'prefix', prefix: before.slice(i + 1), startIdx: i }
    if (ch === '>') return { type: 'flow', prefix: before.slice(i + 1), startIdx: i }
    // 遇到空格/制表符说明已进入参数区，不再提示
    if (ch === ' ' || ch === '\t') break
  }
  return null
}

// 前缀匹配变量名：内置变量 → 词库已使用 → 注入全局变量
function findVarName(prefix, text) {
  for (const v of DIC_BUILTIN_VARS) {
    const name = v[0]
    const ft = v[3] || name
    if (name.startsWith(prefix) || ft.startsWith(prefix)) return name
  }
  const seen = new Set()
  for (const name of scanDicVars(text)) {
    if (!DIC_BUILTIN_VAR_SET.has(name) && name.startsWith(prefix) && !seen.has(name)) {
      return name
    }
  }
  for (const name of injectedGVars()) {
    if (!DIC_BUILTIN_VAR_SET.has(name) && name.startsWith(prefix) && !seen.has(name)) {
      return name
    }
  }
  return null
}

// 前缀匹配段/前缀标记（# 段、[ 前缀），返回含触发字符的完整名
function findKeyword(prefix, type) {
  const cat = type === 'kw' ? '#' : '['
  for (const [name, , , c] of DIC_KEYWORDS) {
    if (c === cat && name.startsWith(cat + prefix)) return name
  }
  return null
}

// 前缀匹配流程控制关键字（> 前缀），返回含触发字符的完整名
function findFlow(prefix) {
  for (const [name] of DIC_FLOW_ITEMS) {
    if (name.startsWith('>' + prefix)) return name
  }
  return null
}

// 注册虚影文字补全：输入 $ % [ # > 后按前缀灰字提示，Tab 接受
monaco.languages.registerInlineCompletionsProvider('nebula', {
  provideInlineCompletions(model, position) {
    const ctx = detectInlineContext(model, position)
    // 需要至少输入一个前缀字符才提示，避免刚打触发符就弹首个候选
    if (!ctx || !ctx.prefix) return { items: [] }

    const prefix = ctx.prefix
    // 空 range：从光标处追加 ghost（只补全剩余部分，不覆盖已输入前缀）
    const range = new monaco.Range(
      position.lineNumber,
      position.column,
      position.lineNumber,
      position.column
    )

    let insertText = ''
    if (ctx.type === 'cmd') {
      const hit = collectCmdCandidates().find((c) => c.name.startsWith(prefix))
      if (!hit) return { items: [] }
      // 无参命令补闭合 $，有参命令补命令名 + 空格（光标停在参数处继续输入）
      insertText = (hit.noArg ? hit.name + '$' : hit.name + ' ').slice(prefix.length)
    } else if (ctx.type === 'var') {
      const name = findVarName(prefix, model.getValue())
      if (!name) return { items: [] }
      insertText = (name + '%').slice(prefix.length)
    } else if (ctx.type === 'flow') {
      const name = findFlow(prefix)
      if (!name) return { items: [] }
      // name 含触发字符，去掉首个字符（>）和已输入前缀，得到剩余补全文本
      insertText = name.slice(1 + prefix.length)
    } else {
      const name = findKeyword(prefix, ctx.type)
      if (!name) return { items: [] }
      // name 含触发字符，去掉首个字符（# 或 [）和已输入前缀，得到剩余补全文本
      insertText = name.slice(1 + prefix.length)
    }

    return { items: [{ insertText, range }] }
  },
})

/* ================= 外部传入词库路径（文件管理跳转） ================= */
const props = defineProps({
  initialPath: { type: String, default: '' },
})

/* ================= 移动端适配 ================= */
const { isMobile } = useMobile()

/* ================= 主题 ================= */
const isDarkMode = inject('isDarkMode')

/* ================= 默认调试词库 ================= */
const DEFAULT_DEBUG_DIC = 'private/debug.n'

/* ================= 词库目录浏览（逐层列出文件夹与 .n 文件） ================= */
const dicBrowseItems = ref([])
const dicBrowseLoading = ref(false)
const dicBrowseDir = ref('private') // 当前浏览目录（相对应用目录）
const dicBrowsePathInput = ref('private') // 顶部可编辑路径

// 计算父目录：private/a/b -> private/a；private -> ''（应用目录根）
function parentDicDir(path) {
  const p = (path || '').trim().replace(/^\/+|\/+$/g, '')
  if (!p) return ''
  const idx = p.lastIndexOf('/')
  return idx < 0 ? '' : p.slice(0, idx)
}

// 读取指定目录下的直接子项（文件夹 + .n 文件）
async function loadDicDir(path) {
  const p = (path || '').trim().replace(/^\/+|\/+$/g, '')
  dicBrowseLoading.value = true
  try {
    const data = await apiPost({ type: 'get_dic_list', data: { path: p } })
    dicBrowseDir.value = p
    dicBrowsePathInput.value = p
    dicBrowseItems.value = data.entries || []
  } catch (e) {
    console.warn('读取词库目录失败:', e)
  } finally {
    dicBrowseLoading.value = false
  }
}

// 返回上级目录
function goDicParent() {
  loadDicDir(parentDicDir(dicBrowseDir.value))
}

// 跳转到输入框中的目录
function jumpDicDir() {
  loadDicDir(dicBrowsePathInput.value)
}

// 点击条目：文件夹进入下一级，.n 文件直接打开
function onDicItemClick(item) {
  if (item.dir) {
    loadDicDir(item.path)
  } else {
    openTab(item.path)
    openFileVisible.value = false
  }
}

/* ================= 调试表单 ================= */
const dicForm = ref({
  path: '',
  trigger: 'Main',
  g: [],
  // 超时（秒），0 表示不限时
  timeout: 15,
  // 上一步/下一步历史记录最大条数
  historyMax: 50,
})
const gKeyInput = ref('')
const gValueInput = ref('')
const gKeyInputEl = ref(null)

const saveRun = ref(false)
// 实时保存：编辑时自动写入词库文件（不触发运行）
const autoSave = ref(false)
const running = ref(false)
const configVisible = ref(false)

/* ================= 高亮配置（localStorage 自定义高亮 JSON） ================= */
const highlightVisible = ref(false)
const highlightText = ref('')
const highlightError = ref('')

function openHighlightConfig() {
  highlightError.value = ''
  try {
    highlightText.value = JSON.stringify(loadRawHighlightConfig(), null, 2)
  } catch (e) {
    highlightText.value = JSON.stringify(dicHighlight, null, 2)
  }
  highlightVisible.value = true
}

function saveHighlightConfig() {
  let raw
  try {
    raw = JSON.parse(highlightText.value)
  } catch (e) {
    highlightError.value = 'JSON 解析失败: ' + (e.message || '')
    return
  }
  let cfg
  try {
    cfg = normalizeHighlightConfig(raw)
  } catch (e) {
    highlightError.value = e.message || '配置校验失败'
    return
  }
  try {
    applyHighlightConfig(cfg)
    localStorage.setItem(HIGHLIGHT_CONFIG_KEY, JSON.stringify(raw))
  } catch (e) {
    highlightError.value = '保存失败: ' + (e.message || '未知错误')
    return
  }
  ElMessage.success('高亮配置已保存')
  highlightVisible.value = false
}

function resetHighlightConfig() {
  try {
    localStorage.removeItem(HIGHLIGHT_CONFIG_KEY)
    const def = normalizeHighlightConfig(dicHighlight)
    applyHighlightConfig(def)
    highlightText.value = JSON.stringify(dicHighlight, null, 2)
    highlightError.value = ''
    ElMessage.success('已恢复默认高亮')
  } catch (e) {
    highlightError.value = '恢复失败: ' + (e.message || '未知错误')
  }
}

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
    (a.trigger || '') === (b.trigger || '') &&
    Number(a.timeout || 0) === Number(b.timeout || 0) &&
    Number(a.historyMax || 0) === Number(b.historyMax || 0) &&
    !!a.saveRun === !!b.saveRun &&
    !!a.autoSave === !!b.autoSave &&
    JSON.stringify(a.g || []) === JSON.stringify(b.g || [])
  )
}

// 应用配置对象到表单
function applyConfig(saved) {
  if (!saved) return
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
  if (saved.historyMax && saved.historyMax > 0) {
    dicForm.value.historyMax = saved.historyMax
    // 设置生效后立即截断已超出上限的历史
    if (history.stack.length > saved.historyMax) {
      history.stack = history.stack.slice(-saved.historyMax)
      history.index = history.stack.length - 1
      if (dicForm.value.path) saveHistory(dicForm.value.path, history)
      updateUndoState()
    }
  }
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

// 构造配置对象（词库文件由标签栏「打开」选择，不纳入运行配置）
function buildConfig() {
  return {
    trigger: dicForm.value.trigger,
    // g 需拷贝一份，避免快照与表单共享同一数组引用导致脏检测失效
    g: [...dicForm.value.g],
    saveRun: saveRun.value,
    autoSave: autoSave.value,
    timeout: dicForm.value.timeout,
    historyMax: dicForm.value.historyMax,
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
    () => dicForm.value.trigger,
    () => dicForm.value.g,
    saveRun,
    autoSave,
    // timeout 也参与脏检测，否则只改超时时不会触发保存
    () => dicForm.value.timeout,
    // 历史记录数量同样参与脏检测
    () => dicForm.value.historyMax,
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
let errorDecorations = []

// 清除错误行高亮
function clearErrorHighlight() {
  if (editor && errorDecorations.length) {
    editor.deltaDecorations(errorDecorations, [])
    errorDecorations = []
  }
}

// 高亮错误行（红色背景）
function highlightErrorLine(line) {
  if (!editor || !line || line < 1) return
  clearErrorHighlight()
  errorDecorations = editor.deltaDecorations([], [
    {
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: 'dic-error-line',
        glyphMarginClassName: 'dic-error-glyph',
        glyphMarginHoverMessage: { value: `错误发生在第 ${line} 行` },
        overviewRuler: { color: 'rgba(255, 0, 0, 0.6)', position: monaco.editor.OverviewRulerLane.Full },
      },
    },
  ])
  // 滚动到错误行并居中
  editor.revealLineInCenter(line)
}

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
    // 圆角选区会在斜边处额外渲染一个 10px 小蓝块，依赖编辑器背景色做反向圆角裁剪；
    // 本页编辑器背景为透明，裁剪失效会漏出独立小蓝块，故关闭圆角选区
    roundedSelection: false,
    renderWhitespace: 'selection',
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    padding: { top: 8, bottom: 8 },
    // 关闭输入即弹出补全：仅 $ % # [ 触发字符触发
    quickSuggestions: false,
    suggestOnTriggerCharacters: true,
    // 开启虚影文字补全（ghost text），Tab 接受
    inlineSuggest: { enabled: true },
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
  // 记住光标与滚动位置：变化后防抖保存到本地
  editor.onDidChangeCursorPosition(() => schedulePersistViewState())
  editor.onDidScrollChange(() => schedulePersistViewState())
  // Ctrl/Cmd + S 保存词库
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveContent())
  // Ctrl/Cmd + Z / Y（含 Ctrl/Cmd + Shift + Z）走自定义历史的上一步/下一步，
  // 覆盖 monaco 原生 undo/redo，避免两套撤销栈不一致
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ, () => undoContent())
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY, () => redoContent())
  editor.addCommand(
    monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ,
    () => redoContent()
  )
  // 禁用 Shift+Alt+A 块注释快捷键（块注释不提供快捷键）
  editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyA, () => {})
}

function setEditorValue(text) {
  dicContent.value = text
  if (editor) {
    suppressChange = true
    editor.setValue(text)
    suppressChange = false
  }
}

// 应用历史文本（撤销/重做）：计算新旧文本的变更区域，
// 光标定位到变更区域起点，并平滑滚动到该位置
function applyHistoryText(target) {
  dicContent.value = target
  if (!editor) return
  const model = editor.getModel()
  const current = editor.getValue()
  // 最长公共前缀/后缀定位变更区域（避免重复内容重叠计算）
  const max = Math.min(current.length, target.length)
  let start = 0
  while (start < max && current[start] === target[start]) start++
  let end = 0
  const maxEnd = max - start
  while (
    end < maxEnd &&
    current[current.length - 1 - end] === target[target.length - 1 - end]
  ) {
    end++
  }
  // 内容无变化时保持原光标位置；否则光标落在变更区域起点（目标文本内）
  let offset
  if (current === target) {
    const pos0 = editor.getPosition()
    offset = pos0 ? model.getOffsetAt(pos0) : 0
  } else {
    offset = start
  }
  offset = Math.min(offset, target.length)
  suppressChange = true
  editor.setValue(target)
  suppressChange = false
  // 光标跟随变更区域，并平滑滚动到编辑位置
  const pos = model.getPositionAt(offset)
  editor.setPosition(pos)
  editor.revealPositionInCenter(pos)
}

// 主题切换同步
watch(isDarkMode, (dark) => {
  editor?.updateOptions({ theme: dark ? 'nebula-dark' : 'nebula-light' })
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

/* ================= 光标与滚动位置记忆 ================= */
const VIEW_STATE_DEBOUNCE = 200
let viewStateTimer = null
// 上一个激活词库路径：切换标签时用于保存其离开时的编辑位置
let lastActivePath = ''

function viewStateKey(path) {
  return 'nebula_dic_debug_view_' + encodeURIComponent(path)
}

// 读取当前编辑器的光标与滚动位置
function currentViewState() {
  if (!editor) return null
  const pos = editor.getPosition()
  return {
    line: pos ? pos.lineNumber : 1,
    column: pos ? pos.column : 1,
    scrollTop: editor.getScrollTop() || 0,
    scrollLeft: editor.getScrollLeft() || 0,
  }
}

function persistViewState(path) {
  const p = (path || '').trim()
  if (!p) return
  const s = currentViewState()
  if (!s) return
  try {
    localStorage.setItem(viewStateKey(p), JSON.stringify(s))
  } catch (e) {
    console.warn('保存编辑位置失败:', e)
  }
}

function getViewState(path) {
  try {
    const raw = localStorage.getItem(viewStateKey(path))
    if (!raw) return null
    const s = JSON.parse(raw)
    if (s && typeof s.line === 'number') return s
  } catch (e) {
    console.warn('读取编辑位置失败:', e)
  }
  return null
}

function clearViewState(path) {
  try {
    localStorage.removeItem(viewStateKey(path))
  } catch (e) {
    console.warn('清除编辑位置失败:', e)
  }
}

// 光标/滚动变化后防抖保存（避免频繁写 localStorage）
function schedulePersistViewState() {
  clearTimeout(viewStateTimer)
  const path = dicForm.value.path.trim()
  if (!path) return
  viewStateTimer = setTimeout(() => {
    if (path === dicForm.value.path.trim()) persistViewState(path)
  }, VIEW_STATE_DEBOUNCE)
}

// 立即保存上一个激活词库的编辑位置（切换标签前调用）
function flushViewState() {
  clearTimeout(viewStateTimer)
  viewStateTimer = null
  if (lastActivePath) persistViewState(lastActivePath)
}

// 恢复指定词库的编辑位置（光标 + 滚动）
function restoreViewState(path) {
  const s = getViewState(path)
  if (!s || !editor) return
  const model = editor.getModel()
  const lineCount = model ? model.getLineCount() : 0
  const line = Math.min(Math.max(1, s.line || 1), lineCount || 1)
  const maxCol = model ? model.getLineMaxColumn(line) : s.column || 1
  editor.setPosition({ lineNumber: line, column: Math.min(Math.max(1, s.column || 1), maxCol) })
  // 等编辑器完成一次布局后再恢复滚动，避免初始布局未完成导致滚动失效
  nextTick(() => {
    if (!editor) return
    editor.setScrollTop(s.scrollTop || 0)
    editor.setScrollLeft(s.scrollLeft || 0)
  })
}

/* ================= 词库内容编辑 ================= */
const dicContent = ref('')
const contentLoading = ref(false)
const contentDirty = ref(false)
const saving = ref(false)

/* ================= 编辑历史（上一步/下一步，持久化到本地） ================= */
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
  // 条数上限取自运行配置（自定义历史记录数量）
  const max = Math.max(1, Number(dicForm.value.historyMax) || 50)
  if (history.stack.length > max) history.stack.shift()
  history.index = history.stack.length - 1
  saveHistory(dicForm.value.path, history)
  updateUndoState()
}

function schedulePushHistory() {
  clearTimeout(historyTimer)
  // 记录触发时的路径：切换标签后旧标签的历史不再写入
  const path = dicForm.value.path.trim()
  if (!path) return
  historyTimer = setTimeout(() => {
    if (path === dicForm.value.path.trim() && dicContent.value !== history.stack[history.index]) {
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

// 撤销/重做前落定待写入的历史（输入防抖期间按下快捷键时也能立即回退到最新内容）
function flushPendingHistory() {
  clearTimeout(historyTimer)
  historyTimer = null
  if (dicForm.value.path && dicContent.value !== history.stack[history.index]) {
    pushHistory(dicContent.value)
  }
}

function undoContent() {
  flushPendingHistory()
  if (history.index <= 0) return
  history.index--
  applyHistoryText(history.stack[history.index])
  syncAfterHistoryEdit()
}

function redoContent() {
  flushPendingHistory()
  if (history.index >= history.stack.length - 1) return
  history.index++
  applyHistoryText(history.stack[history.index])
  syncAfterHistoryEdit()
}

// 重置为文件内容：清除本地缓存并重新读取词库文件
async function handleReset() {
  const path = dicForm.value.path
  if (!path) return
  clearContentCache(path)
  clearHistory(path)
  clearViewState(path)
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
    restoreViewState(path)
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
    restoreViewState(path)
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
  // 记录触发时的路径：切换标签后旧标签的自动保存作废，避免写错文件
  const path = dicForm.value.path.trim()
  if (!path) return
  autoSaveTimer = setTimeout(() => {
    if (path === dicForm.value.path.trim() && contentDirty.value) {
      doAutoSave(path)
    }
  }, AUTO_SAVE_DEBOUNCE)
}

async function doAutoSave(path) {
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
const showOutputFull = ref(false) // 放大查看输出弹窗
// 长字符串变量展开状态：节点 id -> true
const expandedVars = ref({})
// 类对象成员折叠状态：节点 id -> true（默认折叠，点击展开查看成员变量）
const collapsedClasses = ref({})
// 变量区域整个卡片折叠（仅手机端显示折叠功能，默认收起）
const varsCollapsed = ref(false)
// 线程变量列折叠（默认展开）
const threadVarsCollapsed = ref(false)
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

// 折叠/展开线程变量列
function toggleThreadVars() {
  threadVarsCollapsed.value = !threadVarsCollapsed.value
}

// 变量值超长折叠：超过 100 字符显示省略并支持展开/收起
const VAR_LIMIT = 100

// 生成变量的唯一标识（作用域 + 层级路径），用于折叠/展开状态
function varNodeId(scope, path) {
  return scope + ':' + path.join('.')
}

function isVarExpanded(id) {
  return !!expandedVars.value[id]
}

function toggleVar(id) {
  expandedVars.value[id] = !expandedVars.value[id]
}

function isVarLong(val) {
  const s = val && val.v
  return typeof s === 'string' && s.length > VAR_LIMIT
}

function displayVarVal(id, val) {
  const s = val && val.v !== undefined ? val.v : String(val)
  if (isVarExpanded(id) || !isVarLong(val)) return s
  return s.slice(0, VAR_LIMIT) + '…'
}

// 是否为可折叠的类对象（含成员变量）
function isClassVal(val) {
  return (
    val &&
    val.children &&
    typeof val.children === 'object' &&
    !Array.isArray(val.children) &&
    Object.keys(val.children).length > 0
  )
}

function isClassCollapsed(id) {
  return !!collapsedClasses.value[id]
}

function toggleClass(id) {
  if (collapsedClasses.value[id]) {
    delete collapsedClasses.value[id]
  } else {
    collapsedClasses.value[id] = true
  }
}

// 将某个作用域（局部/全局）的变量树展开为可见行，类对象成员按折叠状态展开
function collectVarRows(scope, vars) {
  const rows = []
  const walk = (key, val, depth, path) => {
    const id = varNodeId(scope, path)
    const hasChildren = isClassVal(val)
    const collapsed = hasChildren && isClassCollapsed(id)
    rows.push({ key, val, depth, id, hasChildren, collapsed })
    if (hasChildren && !collapsed) {
      for (const [ck, cv] of Object.entries(val.children)) {
        walk(ck, cv, depth + 1, [...path, ck])
      }
    }
  }
  for (const [key, val] of Object.entries(vars || {})) {
    walk(key, val, 0, [key])
  }
  return rows
}

// 局部/全局/线程变量可见行（类对象折叠后成员不再显示）
const varRowsP = computed(() => collectVarRows('P', result.value?.vars?.P))
const varRowsG = computed(() => collectVarRows('G', result.value?.vars?.G))
const varRowsGV = computed(() => collectVarRows('GV', result.value?.vars?.GV))

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
  clearErrorHighlight()
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
    // 报错行高亮
    if (data && data.errorLine) {
      highlightErrorLine(data.errorLine)
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

/* ================= 多开标签页（多文件编辑） ================= */
// 已打开的标签页：{ path, dirty }，dirty 表示存在未保存修改（内容已缓存本地，重新打开可恢复）
const openTabs = ref([])
const openFileVisible = ref(false)
// 标签栏滚动容器：切换/打开标签时用于把激活标签滚动到可视区域
const dicTabsEl = ref(null)

function activeTab() {
  const p = dicForm.value.path.trim()
  return openTabs.value.find((t) => t.path === p) || null
}

// 标签显示名：路径最后一段
function tabLabel(path) {
  const idx = path.lastIndexOf('/')
  return idx >= 0 ? path.slice(idx + 1) : path
}

// 打开词库文件：新增标签并切换到该文件（内容加载由 path watch 统一处理）
function openTab(path) {
  const p = (path || '').trim()
  if (!p) return
  if (!openTabs.value.some((t) => t.path === p)) {
    openTabs.value.push({ path: p, dirty: false })
  }
  dicForm.value.path = p
}

// 记住当前打开的全部标签页与激活标签到后端（下次进入页面时恢复）
function persistOpenState() {
  const paths = openTabs.value.map((t) => t.path).filter((p) => p && p.trim())
  const active = (dicForm.value.path || '').trim()
  apiPost({ type: 'save_dic_config', data: { path: active, tabs: paths } })
    .then((res) => {
      if (!res || res.status !== 'ok') console.warn('记住打开词库失败')
    })
    .catch((e) => console.warn('记住打开词库失败:', e))
}

function switchTab(path) {
  if (dicForm.value.path !== path) dicForm.value.path = path
}

// 把激活标签横向滚动到可视区域：标签过多溢出时，保证当前标签始终可见
function scrollActiveTabIntoView() {
  nextTick(() => {
    const container = dicTabsEl.value
    if (!container) return
    const active = container.querySelector('.dic-tab.active')
    if (!active) return
    const c = container.getBoundingClientRect()
    const a = active.getBoundingClientRect()
    const margin = 8
    // 激活标签位于左侧可视区外，向左滚动；位于右侧（或被吸顶「打开」按钮遮挡）则向右滚动
    if (a.left < c.left) {
      container.scrollBy({ left: a.left - c.left - margin, behavior: 'smooth' })
    } else if (a.right > c.right) {
      container.scrollBy({ left: a.right - c.right + margin, behavior: 'smooth' })
    }
  })
}

// 关闭标签：关闭激活标签时自动切换到相邻标签；有未保存修改时需确认（内容已缓存，重新打开可恢复）
function closeTab(path) {
  const idx = openTabs.value.findIndex((t) => t.path === path)
  if (idx < 0) return
  const tab = openTabs.value[idx]
  const doClose = () => {
    const wasActive = dicForm.value.path.trim() === path
    openTabs.value.splice(idx, 1)
    if (wasActive) {
      const next = openTabs.value[Math.min(idx, openTabs.value.length - 1)]
      dicForm.value.path = next ? next.path : ''
    }
    // 关闭非激活标签不会触发 path watcher，需显式持久化；全部关闭也需持久化空列表
    if (!wasActive || !dicForm.value.path.trim()) {
      persistOpenState()
    }
  }
  if (!tab.dirty) {
    doClose()
    return
  }
  ElMessageBox.confirm(
    '该词库有未保存的修改（已缓存在本地，重新打开可恢复），确定关闭？',
    '关闭词库',
    { confirmButtonText: '关闭', cancelButtonText: '取消', type: 'warning' }
  )
    .then(doClose)
    .catch(() => {})
}

// 打开词库弹窗：默认进入 private 目录开始浏览
function openFileDialog() {
  openFileVisible.value = true
  loadDicDir('private')
}

// 关闭弹窗时清空浏览状态
function onOpenFileClosed() {
  dicBrowseItems.value = []
}

// 同步当前激活标签的修改标记
watch(contentDirty, (v) => {
  const tab = activeTab()
  if (tab) tab.dirty = v
})

/* ================= 切换词库时重新加载内容 ================= */
watch(
  () => dicForm.value.path,
  (path) => {
    // 归一化路径：去掉首尾空格，避免缓存/历史键与保存路径不一致
    const p = (path || '').trim()
    // 切换词库前保存上一个词库的光标与滚动位置
    if (lastActivePath && lastActivePath !== p) {
      persistViewState(lastActivePath)
    }
    lastActivePath = p
    if (p !== path) {
      dicForm.value.path = p
      return
    }
    if (p) {
      // 确保该文件已在标签栏打开
      if (!openTabs.value.some((t) => t.path === p)) {
        openTabs.value.push({ path: p, dirty: false })
      }
      loadDicContent(p)
      // 记住当前打开的标签页到后端
      persistOpenState()
      // 同步新标签的修改标记（内容加载可能不改变 contentDirty 值，需手动对齐）
      const tab = openTabs.value.find((t) => t.path === p)
      if (tab) tab.dirty = contentDirty.value
      // 切换词库后清除上次结果
      result.value = null
      runError.value = ''
      clearErrorHighlight()
      // 标签过多时把激活标签滚动到可视区域
      scrollActiveTabIntoView()
    } else {
      // 关闭全部标签：清空编辑器与历史
      setEditorValue('')
      contentDirty.value = false
      history = { stack: [''], index: 0 }
      updateUndoState()
      result.value = null
      runError.value = ''
      clearErrorHighlight()
    }
  }
)

/* ================= 初始化 ================= */
// 恢复初始打开的词库标签：优先恢复后端记住的全部标签，其次外部传入/上次激活文件，最后默认调试词库
async function restoreInitialFile() {
  let tabs = []
  let last = ''
  try {
    const data = await apiPost({ type: 'get_dic_config' })
    if (data && Array.isArray(data.tabs)) {
      tabs = data.tabs.filter((p) => typeof p === 'string' && p.trim())
    }
    last = (data && data.path) || ''
  } catch (e) {
    console.warn('读取上次打开词库失败:', e)
  }

  // 先恢复已保存的全部标签（直接入列，避免逐个 openTab 触发多次加载/持久化）
  for (const p of tabs) {
    if (!openTabs.value.some((t) => t.path === p)) {
      openTabs.value.push({ path: p, dirty: false })
    }
  }

  let target = ''
  if (props.initialPath) {
    target = props.initialPath.trim()
    if (target && !openTabs.value.some((t) => t.path === target)) {
      openTabs.value.push({ path: target, dirty: false })
    }
  } else if (tabs.length) {
    target = tabs.includes(last) ? last : tabs[tabs.length - 1]
  } else if (last) {
    target = last
  }

  if (target) {
    // 触发 path watcher 加载内容并持久化
    dicForm.value.path = target
  } else if (!dicForm.value.path.trim()) {
    openTab(DEFAULT_DEBUG_DIC)
  }
}

onMounted(() => {
  loadConfig()
  loadDicFuncs()
  createEditor()
  restoreInitialFile()
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
  flushViewState()
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
      <div class="page-header-actions">
        <ElButton :icon="Brush" @click="openHighlightConfig">
          高亮配置
        </ElButton>
        <ElButton type="primary" :icon="Setting" @click="configVisible = true">
          运行配置
        </ElButton>
      </div>
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

        <ElFormItem label="历史记录数量">
          <ElInputNumber
            v-model="dicForm.historyMax"
            :min="1"
            :max="500"
            :step="1"
            :controls="false"
            style="width: 120px"
          />
          <span class="timeout-hint">条，上一步/下一步最大步数</span>
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

    <!-- 打开词库弹窗 -->
    <ElDialog
      v-model="openFileVisible"
      title="打开词库"
      :width="isMobile ? '92%' : 480"
      destroy-on-close
      @closed="onOpenFileClosed"
    >
      <div class="open-file-body">
        <div class="open-file-bar">
          <ElButton size="small" :disabled="!dicBrowseDir" @click="goDicParent">上级</ElButton>
          <ElInput
            v-model="dicBrowsePathInput"
            placeholder="目录路径，如 private"
            clearable
            @keyup.enter="jumpDicDir"
          />
        </div>
        <div v-if="dicBrowseLoading" class="open-file-loading">加载中…</div>
        <div v-else-if="dicBrowseItems.length" class="open-file-results">
          <div
            v-for="item in dicBrowseItems"
            :key="item.path"
            class="open-file-item"
            :class="{ 'is-dir': item.dir }"
            @click="onDicItemClick(item)"
          >
            {{ item.name }}
          </div>
        </div>
        <div v-else class="open-file-empty">空目录</div>
      </div>
      <template #footer>
        <ElButton @click="openFileVisible = false">取消</ElButton>
      </template>
    </ElDialog>

    <!-- 高亮配置弹窗 -->
    <ElDialog
      v-model="highlightVisible"
      title="高亮配置"
      :width="isMobile ? '92%' : 560"
      destroy-on-close
    >
      <div class="highlight-dialog-body">
        <p class="highlight-tip">
          自定义词库编辑器语法高亮。暗色主题 / 亮色主题 为主题配色（规则 为 标记 颜色，颜色 为编辑器颜色）；
          分词规则 为标记识别规则（规则 单条正则、配对 成对定界符），自定义规则 为额外正则高亮。
          正则按 JS 语法，JSON 中反斜杠需写成 \\（例如 \\$）。颜色 中的键为 Monaco 编辑器颜色 ID（如 editor.background），保持英文。
        </p>
        <ElInput
          v-model="highlightText"
          type="textarea"
          :rows="18"
          resize="vertical"
          spellcheck="false"
          placeholder="请输入高亮 JSON 配置"
        />
        <div v-if="highlightError" class="highlight-error">{{ highlightError }}</div>
      </div>
      <template #footer>
        <ElButton @click="resetHighlightConfig">恢复默认</ElButton>
        <ElButton @click="highlightVisible = false">取消</ElButton>
        <ElButton type="primary" @click="saveHighlightConfig">保存</ElButton>
      </template>
    </ElDialog>

    <!-- 词库内容 + 变量 -->
      <div class="content-actions-row">
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
          <ElButton
            class="run-btn"
            type="primary"
            :icon="VideoPlay"
            :loading="running"
            @click="runDic"
          >
            运行词库
          </ElButton>
        </div>
      </div>

      <!-- 多开标签栏：多标签切换编辑词库文件 -->
      <div ref="dicTabsEl" class="dic-tabs">
        <div
          v-for="tab in openTabs"
          :key="tab.path"
          class="dic-tab"
          :class="{ active: tab.path === dicForm.path.trim() }"
          :title="tab.path"
          @click="switchTab(tab.path)"
        >
          <span class="dic-tab-name">{{ tabLabel(tab.path) }}</span>
          <span v-if="tab.dirty" class="dic-tab-dirty" title="有未保存的修改" />
          <el-icon class="dic-tab-close" @click.stop="closeTab(tab.path)">
            <Close />
          </el-icon>
        </div>
        <div class="dic-tab-add" @click="openFileDialog">
          <el-icon><Plus /></el-icon>
          <span>打开</span>
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
              <div v-if="varRowsP.length" class="vars-box">
                <div
                  v-for="row in varRowsP"
                  :key="row.id"
                  class="var-row"
                  :style="{ paddingLeft: 12 + row.depth * 14 + 'px' }"
                >
                  <span
                    v-if="row.hasChildren"
                    class="var-arrow"
                    @click="toggleClass(row.id)"
                  >{{ row.collapsed ? '▶' : '▼' }}</span>
                  <span class="var-key">{{ row.key }}</span>
                  <ElTag class="var-type" size="small" type="info">{{ row.val.t || '未知' }}</ElTag>
                  <div class="var-val-wrap">
                    <span class="var-val">{{ displayVarVal(row.id, row.val) }}</span>
                    <ElButton
                      v-if="isVarLong(row.val)"
                      class="var-toggle"
                      link
                      type="primary"
                      size="small"
                      @click="toggleVar(row.id)"
                    >
                      {{ isVarExpanded(row.id) ? '收起' : '展开' }}
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
              <div v-if="varRowsG.length" class="vars-box">
                <div
                  v-for="row in varRowsG"
                  :key="row.id"
                  class="var-row"
                  :style="{ paddingLeft: 12 + row.depth * 14 + 'px' }"
                >
                  <span
                    v-if="row.hasChildren"
                    class="var-arrow"
                    @click="toggleClass(row.id)"
                  >{{ row.collapsed ? '▶' : '▼' }}</span>
                  <span class="var-key">{{ row.key }}</span>
                  <ElTag class="var-type" size="small" type="info">{{ row.val.t || '未知' }}</ElTag>
                  <div class="var-val-wrap">
                    <span class="var-val">{{ displayVarVal(row.id, row.val) }}</span>
                    <ElButton
                      v-if="isVarLong(row.val)"
                      class="var-toggle"
                      link
                      type="primary"
                      size="small"
                      @click="toggleVar(row.id)"
                    >
                      {{ isVarExpanded(row.id) ? '收起' : '展开' }}
                    </ElButton>
                  </div>
                </div>
              </div>
              <div v-else class="vars-empty">
                <ElEmpty description="暂无全局变量" :image-size="60" />
              </div>
            </div>
            <div class="vars-col">
              <div class="vars-col-title vars-col-title-row" @click="toggleThreadVars">
                <span class="var-arrow">{{ threadVarsCollapsed ? '▶' : '▼' }}</span>
                <span>线程变量</span>
              </div>
              <div v-if="!threadVarsCollapsed">
                <div v-if="varRowsGV.length" class="vars-box">
                <div
                  v-for="row in varRowsGV"
                  :key="row.id"
                  class="var-row"
                  :style="{ paddingLeft: 12 + row.depth * 14 + 'px' }"
                >
                  <span
                    v-if="row.hasChildren"
                    class="var-arrow"
                    @click="toggleClass(row.id)"
                  >{{ row.collapsed ? '▶' : '▼' }}</span>
                  <span class="var-key">{{ row.key }}</span>
                  <ElTag class="var-type" size="small" type="info">{{ row.val.t || '未知' }}</ElTag>
                  <div class="var-val-wrap">
                    <span class="var-val">{{ displayVarVal(row.id, row.val) }}</span>
                    <ElButton
                      v-if="isVarLong(row.val)"
                      class="var-toggle"
                      link
                      type="primary"
                      size="small"
                      @click="toggleVar(row.id)"
                    >
                      {{ isVarExpanded(row.id) ? '收起' : '展开' }}
                    </ElButton>
                  </div>
                </div>
              </div>
              <div v-else class="vars-empty">
                <ElEmpty description="暂无线程变量" :image-size="60" />
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="form-hint">
        支持词库语法实时编辑：修改后点击「运行词库」或「保存词库」即可生效，无需重启服务
      </div>
      <div class="shortcut-hints">
        <span class="shortcut-hint"><kbd>Ctrl</kbd>+<kbd>S</kbd> 保存</span>
        <span class="shortcut-hint"><kbd>Ctrl</kbd>+<kbd>Z</kbd> 上一步</span>
        <span class="shortcut-hint"><kbd>Ctrl</kbd>+<kbd>Y</kbd> 下一步</span>
        <span class="shortcut-hint"><kbd>Ctrl</kbd>+<kbd>/</kbd> 注释</span>
      </div>

    <!-- 运行输出 -->
    <div class="output-zone">
      <div class="output-actions">
        <ElButton
          size="small"
          type="primary"
          plain
          :icon="FullScreen"
          :disabled="!result"
          @click="showOutputFull = true"
        >
          放大
        </ElButton>
        <ElButton
          v-if="result && !runError"
          size="small"
          type="primary"
          plain
          @click="copyOutput"
        >
          复制
        </ElButton>
      </div>
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

    <!-- 放大查看弹窗 -->
    <ElDialog
      v-model="showOutputFull"
      title="运行输出"
      :width="isMobile ? '96%' : '80%'"
      :top="isMobile ? '2vh' : '5vh'"
      destroy-on-close
    >
      <div class="output-full-body">
        <div v-if="runError" class="error-box">{{ runError }}</div>
        <div v-else-if="result" class="output-text output-text-full">
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
          <ElEmpty description="暂无输出结果" :image-size="60" />
        </div>
      </div>
      <template #footer>
        <ElButton @click="copyOutput">复制文本</ElButton>
        <ElButton type="primary" @click="showOutputFull = false">关闭</ElButton>
      </template>
    </ElDialog>
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

.page-header-actions {
  display: flex;
  align-items: center;
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

.highlight-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.highlight-tip {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.highlight-error {
  font-size: 13px;
  color: var(--el-color-danger);
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

/* ==================== 多开标签栏 ==================== */
.dic-tabs {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  margin-bottom: 0;
  overflow-x: auto;
  scrollbar-width: thin;
}

.dic-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  max-width: 220px;
  padding: 5px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  background: var(--el-fill-color-light);
  font-size: 13px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s, color 0.2s, border-color 0.2s;
}

.dic-tab:hover {
  background: var(--el-fill-color);
}

.dic-tab.active {
  background: var(--el-bg-color);
  border-color: var(--el-color-primary-light-5);
  color: var(--el-color-primary);
  font-weight: 600;
}

.dic-tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dic-tab-dirty {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-color-warning);
}

.dic-tab-close {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  border-radius: 4px;
}

.dic-tab-close:hover {
  color: var(--el-color-danger);
  background: var(--el-fill-color-darker);
}

.dic-tab-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  /* 标签过多时始终贴在右侧可见区，保证「打开」按钮不被滚出视口 */
  position: sticky;
  right: 0;
  z-index: 1;
  padding: 5px 10px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px 8px 0 0;
  background: var(--el-bg-color);
  font-size: 13px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  user-select: none;
  transition: color 0.2s, border-color 0.2s;
}

.dic-tab-add:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
}

/* 打开词库弹窗：目录浏览 */
.open-file-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.open-file-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.open-file-bar .el-input {
  flex: 1;
}

.open-file-loading {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 4px 2px;
}

.open-file-empty {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 16px 2px;
  text-align: center;
}

.open-file-results {
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-blank);
}

.open-file-item {
  padding: 8px 12px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  border-bottom: 1px solid var(--el-border-color-lighter);
  word-break: break-all;
  transition: background-color 0.2s;
}

.open-file-item.is-dir {
  font-weight: 600;
  color: var(--el-color-primary);
}

.open-file-item:last-child {
  border-bottom: none;
}

.open-file-item:hover {
  background: var(--el-fill-color-light);
  color: var(--el-color-primary);
}

.content-actions-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.content-actions {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 运行词库：靠右放置 */
.content-actions .run-btn {
  margin-left: auto;
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
  background: var(--el-bg-color);
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
  /* 不随父级收缩，保持内容完整高度，由外层 .vars-panel 统一滚动查看超长变量 */
  flex-shrink: 0;
  /* 折叠动画期间裁剪内容；展开结束后高度恢复 auto 不影响显示 */
  overflow: hidden;
}

.vars-panel .vars-box {
  max-height: none;
}

.auto-run-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.form-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.shortcut-hints {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.shortcut-hint {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
}

.shortcut-hint kbd {
  display: inline-block;
  min-width: 14px;
  padding: 1px 5px;
  border: 1px solid var(--el-border-color);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--el-fill-color);
  font-family: inherit;
  font-size: 11px;
  line-height: 1.5;
  text-align: center;
  color: var(--el-text-color-regular);
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

.output-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  display: flex;
  gap: 8px;
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

/* 放大弹窗内输出：取消右侧留白，无高度限制 */
.output-text-full {
  padding: 0;
  max-height: 70vh;
  overflow: auto;
}

.output-full-body {
  min-height: 120px;
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

.vars-col-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
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

/* 类对象成员折叠箭头 */
.var-arrow {
  flex-shrink: 0;
  width: 14px;
  text-align: center;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  font-size: 11px;
  line-height: 1.5;
  user-select: none;
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

  .auto-run-inline {
    justify-content: flex-end;
  }

  .content-actions-row {
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

  /* 手机端隐藏快捷键说明 */
  .shortcut-hints {
    display: none;
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

  .page-header-actions {
    width: 100%;
  }

  .page-header-actions .el-button {
    flex: 1;
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

<style>
/* DIC 调试报错行高亮（Monaco 编辑器装饰器，需非 scoped） */
.dic-error-line {
  background-color: rgba(255, 0, 0, 0.15) !important;
  border-left: 3px solid #e74c3c !important;
}
.dic-error-glyph {
  background: #e74c3c;
  width: 3px !important;
  margin-left: 3px;
}
</style>
