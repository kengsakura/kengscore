// สร้างหน้าตัวอย่าง (โหมดสาธิต) สำหรับเผยแพร่เป็น Artifact บน claude.ai
// ผลลัพธ์: dist-artifact/page.html + app.js + app.css
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

execSync('npx vite build --config vite.artifact.config.ts', { stdio: 'inherit' })

const out = 'dist-artifact'
for (const f of ['app.js', 'app.css']) if (!existsSync(`${out}/${f}`)) throw new Error(`missing ${out}/${f}`)

const page = `<title>KengScore</title>
<meta name="theme-color" content="#4f46e5">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="app.css">
<div id="root"></div>
<script type="module" src="app.js"></script>
`
writeFileSync(`${out}/page.html`, page)
const kb = (f) => (readFileSync(`${out}/${f}`).length / 1024).toFixed(0)
console.log(`artifact ready: page.html, app.js (${kb('app.js')} KB), app.css (${kb('app.css')} KB)`)
