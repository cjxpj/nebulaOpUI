/**
 * 一键打包上传到 Cloudflare Pages(项目名:nebulaopui)
 *
 * 用法:
 *   npm run deploy              # 构建(dist)并上传到 Cloudflare Pages
 *
 * 前置条件:
 *   1. 已设置用户环境变量 CLOUDFLARE_API_TOKEN(Cloudflare API Token)
 *      PowerShell: [Environment]::SetEnvironmentVariable("CLOUDFLARE_API_TOKEN", "<token>", "User")
 *      若当前终端读不到(如 IDE 缓存了旧环境),脚本会自动从系统用户环境变量
 *      (注册表 HKCU\Environment)兜底读取,无需重启终端。
 *   2. 已安装依赖(wrangler 位于 devDependencies)
 *
 * 说明:
 *   - 先执行 npm run build 生成 dist(见 package.json 的 deploy 脚本),
 *     再由本脚本调用 wrangler 上传 dist 到 Pages 项目 nebulaopui。
 *   - 上传完成后访问 https://nebulaopui.pages.dev
 */
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Token 优先从环境变量读取;缺失时从 Windows 用户环境变量(注册表)兜底读取,
// 避免 IDE/Explorer 缓存旧环境导致新设置的环境变量读不到
if (!process.env.CLOUDFLARE_API_TOKEN) {
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', 'CLOUDFLARE_API_TOKEN'], {
      encoding: 'utf8',
      windowsHide: true,
    })
    const m = out.match(/CLOUDFLARE_API_TOKEN\s+REG_SZ\s+(\S+)/)
    if (m) process.env.CLOUDFLARE_API_TOKEN = m[1].trim()
  } catch {
    // 注册表读取失败时走下面的统一报错
  }
}

if (!process.env.CLOUDFLARE_API_TOKEN) {
  console.error('[deploy] 缺少环境变量 CLOUDFLARE_API_TOKEN,请先设置后再运行')
  process.exit(1)
}

// 调用 wrangler 将 dist 目录部署为 Pages 项目 nebulaopui
const cmd = 'npx wrangler pages deploy dist --project-name nebulaopui'
// stdio: 'inherit' 透传 wrangler 输出到终端;shell: true 兼容 Windows 下 npx 的 .cmd 启动器
const child = spawn(cmd, { stdio: 'inherit', shell: true, cwd: root, env: process.env })
// 以 wrangler 的退出码结束进程,便于 CI/脚本判断成败
child.on('exit', (code) => process.exit(code ?? 1))
