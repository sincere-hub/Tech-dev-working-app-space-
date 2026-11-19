const fs = require("node:fs");
const crypto = require("node:crypto");
const readline = require("node:readline/promises");

async function main() {
  const input = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let appId;
  let keyPath;

  try {
    appId = (
      await input.question("GitHub App ID (numbers only): ")
    ).trim();

    if (!/^\d+$/.test(appId)) {
      throw new Error(
        "Use the numeric App ID from your GitHub App page."
      );
    }

    keyPath = (
      await input.question(
        "Full path to your downloaded .pem file: "
      )
    ).trim().replace(/^"|"$/g, "");
  } finally {
    input.close();
  }

  const privateKey = fs.readFileSync(keyPath, "utf8");

  const encode = value =>
    Buffer.from(JSON.stringify(value)).toString("base64url");

  const now = Math.floor(Date.now() / 1000);

  const unsigned =
    encode({ alg: "RS256", typ: "JWT" }) +
    "." +
    encode({
      iat: now - 60,
      exp: now + 540,
      iss: appId,
    });

  const signature = crypto.sign(
    "RSA-SHA256",
    Buffer.from(unsigned),
    privateKey
  );

  const jwt =
    unsigned + "." + signature.toString("base64url");

  const installations = [];

  for (let page = 1; ; page++) {
    const response = await fetch(
      `https://api.github.com/app/installations?per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "TechDev-Installation-Lookup",
        },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));

      throw new Error(
        `GitHub ${response.status}: ${
          body.message || "Request failed"
        }`
      );
    }

    const rows = await response.json();

    if (!Array.isArray(rows)) {
      throw new Error("Unexpected GitHub response.");
    }

    installations.push(...rows);

    if (rows.length < 100) break;
  }

  if (!installations.length) {
    console.log(
      "This GitHub App currently has no installations."
    );
    return;
  }

  console.table(
    installations.map(item => ({
      Account: item.account.login,
      Installation_ID: item.id,
      Repository_access: item.repository_selection,
      Suspended: Boolean(item.suspended_at),
    }))
  );
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});