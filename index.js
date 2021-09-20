#! /usr/bin/env node

import fs from 'fs'
import path from 'path'
import http from 'http'

import getPort from 'get-port'
import { micromark } from 'micromark'
import { gfm, gfmHtml } from 'micromark-extension-gfm'
import pocket from 'pocket.io'
import filewatcher from 'filewatcher'

import pkg from './package.json'

const [readme, desiredPort] = process.argv.slice(2)

function createDevClient({ port }) {
  return `
    <script>
      (function (global) {
        try {
          const socketio = document.createElement('script')
          socketio.src = 'https://unpkg.com/pocket.io@0.1.4/min.js'
          socketio.onload = function init () {
            var disconnected = false
            var socket = io('http://localhost:${port}', {
              reconnectionAttempts: 3
            })
            socket.on('connect', function() { console.log('presta connected on port ${port}') })
            socket.on('refresh', function() {
              global.location.reload()
            })
            socket.on('disconnect', function() {
              disconnected = true
            })
            socket.on('reconnect_failed', function(e) {
              if (disconnected) return
              console.error("presta - connection to server on :${port} failed")
            })
          }
          document.head.appendChild(socketio)
        } catch (e) {}
      })(this);
    </script>
  `
}

;(async () => {
  if (!readme) {
    console.error(`\n  ${pkg.name}@${pkg.version}\n\n  👉 ${pkg.name} path/to/README.md [port]`)
    process.exit(1)
    return
  }

  const port = desiredPort || (await getPort())
  const devClient = createDevClient({ port })
  const filepath = path.join(process.cwd(), readme)

  const server = http
    .createServer((req, res) => {
      const markdown = fs.readFileSync(filepath, 'utf-8')
      const body = micromark(markdown, { extensions: [gfm()], htmlExtensions: [gfmHtml] })

      res.writeHead(200, {
        'Content-Type': 'text/html',
      })
      res.write(
        `<!DOCTYPE html>
        <html>
          <head>
            <title>${pkg.name}@${pkg.version}</title>
            <link rel='stylesheet' href='https://github.githubassets.com/assets/frameworks-cbbaa69edba29ec29cf6fce3cfb63359.css' />
            <link rel='stylesheet' href='https://github.githubassets.com/assets/behaviors-e78f792bb4eb683743d2b5231fb828db.css' />
            <link rel="stylesheet" href="https://unpkg.com/@highlightjs/cdn-assets@11.2.0/styles/github.min.css">
            <script src="https://unpkg.com/@highlightjs/cdn-assets@11.2.0/highlight.min.js"></script>
            <style>
              .markdown-body {
                box-sizing: border-box;
                min-width: 200px;
                max-width: 980px;
                margin: 0 auto;
                padding: 45px;
              }
              pre code.hljs {
                padding: 0;
              }

              @media (max-width: 767px) {
                .markdown-body {
                  padding: 15px;
                }
              }
            </style>
          </head>
          <body>
            <div class='markdown-body entry-content container-lg'>
              ${body}
            </div>
            ${devClient}
            <script>hljs.highlightAll();</script>
          </body>
        </html>`
      )
      res.end()
    })
    .listen(port, () => {
      console.log(`\n  ${pkg.name}@${pkg.version}\n\n  👍 serving ${readme} on http://localhost:${port}\n`)
    })

  const socket = pocket(server, { serveClient: false })
  const watcher = filewatcher()

  watcher.add(filepath)

  watcher.on('change', (file, stat) => {
    socket.emit('refresh')
  })
})()
