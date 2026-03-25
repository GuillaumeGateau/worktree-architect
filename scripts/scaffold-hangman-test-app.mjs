import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "test-apps", "hangman-demo");
mkdirSync(dir, { recursive: true });

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Hangman (orch-os test app)</title>
  <style>
    :root { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; }
    body { max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.25rem; }
    .word { font-size: 2rem; letter-spacing: 0.35em; font-family: ui-monospace, monospace; }
    .bad { color: #f87171; }
    button { margin: 0.15rem; padding: 0.35rem 0.5rem; cursor: pointer; }
    footer { margin-top: 2rem; font-size: 0.8rem; opacity: 0.7; }
  </style>
</head>
<body>
  <h1>Hangman — disposable test app</h1>
  <p>Delete <code>test-apps/</code> when done. Not part of the git repo.</p>
  <p class="word" id="word"></p>
  <p>Wrong: <span id="wrong" class="bad"></span></p>
  <div id="keys"></div>
  <p id="msg"></p>
  <footer>orch-os manual test</footer>
  <script>
    const SECRET = "ORCHESTRA";
    let guessed = new Set();
    let wrong = 0;
    const maxWrong = 8;

    function render() {
      const w = SECRET.split("").map((c) => (guessed.has(c) ? c : "_")).join(" ");
      document.getElementById("word").textContent = w;
      document.getElementById("wrong").textContent = wrong + " / " + maxWrong;
      if (!w.includes("_")) document.getElementById("msg").textContent = "You win.";
      else if (wrong >= maxWrong) document.getElementById("msg").textContent = "You lose. Word was " + SECRET;
    }

    function guess(ch) {
      if (guessed.has(ch)) return;
      guessed.add(ch);
      if (!SECRET.includes(ch)) wrong++;
      render();
    }

    const keys = document.getElementById("keys");
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((ch) => {
      const b = document.createElement("button");
      b.textContent = ch;
      b.addEventListener("click", () => guess(ch));
      keys.appendChild(b);
    });
    render();
  </script>
</body>
</html>
`;

writeFileSync(join(dir, "index.html"), html, "utf8");

const jobYaml = `role: hangman-demo
contractVersion: 1
branch: test/hangman-demo
worktreePath: test-apps/hangman-demo
payload:
  title: "Create / verify hangman in test-apps"
  artifact: "test-apps/hangman-demo/index.html"
`;

writeFileSync(join(dir, "orchestrator-job.yaml"), jobYaml, "utf8");

writeFileSync(
  join(dir, "README.txt"),
  `Disposable test app (gitignored parent test-apps/).

Open index.html in a browser.
Enqueue: npm run orchestrator -- job enqueue test-apps/hangman-demo/orchestrator-job.yaml
`,
  "utf8"
);

console.log("Scaffolded:", dir);
console.log("Next (with orchestrator start running):");
console.log(
  "  npm run orchestrator -- job enqueue test-apps/hangman-demo/orchestrator-job.yaml"
);
