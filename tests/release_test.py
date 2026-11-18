"""Exercise the actual release script against a throwaway local Git remote.
The test's gh/curl doubles do not contact GitHub or publish anything.
"""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class Release(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        self.w = root / "repo"
        self.w.mkdir()
        self.bin = root / "bin"
        self.bin.mkdir()
        self.calls = root / "calls"
        self.env = {
            **os.environ,
            "PATH": str(self.bin) + os.pathsep + os.environ["PATH"],
            "GITHUB_REPOSITORY": "example/fixture",
            "CALLS": str(self.calls),
            "RELEASES": "",
            "LATEST": "v1.0.0",
        }
        for f in ("build.js", "ignis.user.js"):
            shutil.copy(ROOT / f, self.w / f)
        shutil.copytree(ROOT / "src", self.w / "src")
        self.cmd("git", "init", "-q", "-b", "main")
        self.cmd("git", "config", "user.name", "Fixture")
        self.cmd("git", "config", "user.email", "qa@example.invalid")
        self.cmd("git", "add", ".")
        self.commit("base")
        self.tag = "v" + self.cmd("node", "build.js", "--version").strip()
        self.cmd("git", "init", "--bare", "-q", str(root / "origin.git"))
        self.cmd("git", "remote", "add", "origin", str(root / "origin.git"))
        self.cmd("git", "push", "-q", "origin", "main")
        self.tool(
            "gh",
            """case "$1:$2" in
api:--paginate) printf '%s' "$RELEASES";;
api:repos/*/releases/latest) echo "$LATEST";;
release:create) echo "create $3" >> "$CALLS";;
*) exit 2;; esac""",
        )
        self.tool(
            "curl",
            """echo "URL ${@: -1}" >> "$CALLS";while [[ $1 != --output ]];do shift;done; if [[ -n ${BAD_ASSET:-} ]]; then echo 'different @version' > "$2"; else cp ignis.user.js "$2";fi""",
        )
        self.tool("sleep", ":")

    def tool(self, name, code):
        p = self.bin / name
        p.write_text("#!/usr/bin/env bash\nset -eu\n" + code + "\n")
        p.chmod(0o755)

    def cmd(self, *args):
        return subprocess.check_output(args, cwd=self.w, env=self.env, text=True, stderr=subprocess.STDOUT)

    def commit(self, msg):
        self.cmd("git", "commit", "-q", "--allow-empty", "-m", msg)
        self.env["GITHUB_SHA"] = self.cmd("git", "rev-parse", "HEAD").strip()

    def release(self, success=True):
        r = subprocess.run(
            ["bash", str(ROOT / "scripts/release.sh")],
            cwd=self.w,
            env=self.env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(r.returncode == 0, success, r.stdout + r.stderr)
        return self.calls.read_text() if self.calls.exists() else ""

    def published(self):
        self.env.update(RELEASES=f"{self.tag}\tfalse\tfalse\n", LATEST=self.tag)

    def test_publish_and_idempotent_rerun(self):
        log = self.release()
        self.assertEqual(log.count("create "), 1)
        self.assertEqual(log.count("URL "), 2)
        self.published()
        self.calls.unlink()
        self.assertNotIn("create ", self.release())
        self.assertEqual(self.cmd("git", "rev-parse", self.tag + "^{commit}").strip(), self.env["GITHUB_SHA"])

    def test_wrong_published_bytes_fail_even_if_userscript_header_present(self):
        self.cmd("git", "tag", self.tag)
        self.published()
        self.env["BAD_ASSET"] = "yes"
        self.assertNotIn("create ", self.release(False))

    def test_unreleased_tag_is_never_attached_to_a_different_commit(self):
        self.cmd("git", "tag", self.tag)
        self.commit("docs")
        self.cmd("git", "push", "-q", "origin", "main")
        self.assertFalse(self.release(False))

    def test_version_collision_rejected_for_changed_bytes(self):
        self.cmd("git", "tag", self.tag)
        part = self.w / "src/part3.js"
        part.write_text(part.read_text() + "\n// changed source\n")
        self.cmd("node", "build.js")
        self.cmd("git", "add", ".")
        self.commit("change without bump")
        self.cmd("git", "push", "-q", "origin", "main")
        self.published()
        self.assertFalse(self.release(False))

    def test_stale_main_run_skips_all_writes(self):
        self.commit("not the remote tip")
        self.assertFalse(self.release())
        self.assertFalse(self.cmd("git", "tag", "-l"))

    def test_no_channel_downgrade(self):
        self.env.update(RELEASES="v99.0.0\tfalse\tfalse\n", LATEST="v99.0.0")
        self.assertFalse(self.release(False))


if __name__ == "__main__":
    unittest.main(verbosity=2)
