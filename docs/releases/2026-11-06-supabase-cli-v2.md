# Supported Supabase CLI v2 and parser dependency cleanup

Base: master `849310234de4f97ad0f15643f81aaad3de6a9c52`.
Pin the direct operator CLI from `^2.99.0` to exact `2.122.1`, together with its
eight matching platform distribution versions and their npm integrities.
Application source, Supabase JavaScript SDK, SQL and existing operator tools are
unchanged. This does not upgrade the separately pinned SQL fresh-apply CLI.

## Scope and source evidence

The [vendor release](https://github.com/supabase/cli/releases/tag/v2.122.1)
provides the maintained v2 install channel after v3, with v2 receiving security
fixes and fixes for fundamentally broken behavior. This selects a supported v2
distribution; it is not a claim that this was the first release to fix every
bundled component. The [v3 migration guide](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3)
describes operational changes that are outside this dependency correction.

The old CLI tree resolves Effect `4.0.0-beta.67`, which declares `toml ^4.1.1`.
The npm report has one high Effect rollup and one high TOML row, sharing five
TOML advisory identifiers. The [TOML maintainer advisories](https://github.com/BinaryMuse/toml-node/security/advisories)
cover recursion, prototype handling and complexity defects. No published TOML
fix satisfies the existing 4.x parent range; forcing TOML 5 or changing the
external Effect beta would not update the already compiled CLI binary.

The actual npm entrypoint is a small Node shim selecting and launching a native
platform package. It does not import the external Effect/TOML tree. Accordingly,
their external execution is not represented as demonstrated, and npm metadata
alone is not treated as an inventory of compiled code.

The [tagged v2.122.1 source](https://github.com/supabase/cli/tree/v2.122.1/apps/cli)
and its [lockfile](https://github.com/supabase/cli/blob/v2.122.1/pnpm-lock.yaml)
use Effect `4.0.2` and `smol-toml 1.8.0`, without the old npm `toml` package.
The new published shim and platform version are checked, and real native CLI
commands are exercised. This evidence does not claim to audit every component
embedded in the vendor's compiled distribution.

## Preserve the unrelated optional parser

Removing the old CLI tree also removed its `yaml 2.9.0`, which happened to satisfy
the optional peer of `postcss-load-config 6.0.1`. A real `.postcssrc.yaml` fixture
loaded before the update and failed afterward because `yaml` was missing.
Keep exactly that existing parser as an explicit development dependency. Its
locked version and bytes stay unchanged; this is separate from the still-open
`js-yaml` advisory rows.

The lock delta changes the CLI plus eight platform entries, removes 100 entries
from the old CLI dependency closure and adds six private dependencies of the new
CLI. After retaining YAML, no shared dependency descriptor changes. Other direct
dependencies and the MapLibre, Zod, Radix and tooling corrections are preserved.

## Behavioral gates and limits

One concrete operator behavior differs: with an explicit `--workdir` pointing
at a subdirectory, `2.99.0` still found the ancestor project, while `2.122.1`
uses that path exactly. Callers must pass the actual directory containing
`supabase/`. Without the flag, upward discovery remains supported and tested.
Repository calls already pass the real bootstrap directory; no affected call
was identified. The wrapper forwards arguments unchanged and does not restore
the old implicit ancestor selection. This version change must be considered
in operator review, rather than presented as entirely identical CLI behavior.

Five Node tests cover:

- Exact v2 pin, shim entrypoint and matching platform versions.
- The real PostCSS parent loading a nonempty YAML fixture with its previous parser.
- The actual installed native CLI reporting the exact version and v2 help.
- Native `init` in a disposable directory, explicit `--workdir`, invalid TOML
  refusal and successful parsing of the generated config before dispatch to the
  absent local Docker stack. The expected local-stack error is distinguished
  from the parser error. Paired nested-directory cases prove default ancestor
  discovery and explicit-path isolation; no stack is started or migration applied.
- The unchanged repository wrapper forwarding opaque arguments, private home
  and nonzero exit codes through the actual shim. Only this transport witness
  uses a harmless Node observer in place of the native binary; the native tests
  above do not inherit an override.

Native probes use an isolated home/cwd, an unissued token sentinel and a bounded
process tree. Real project credentials are not supplied. Local proxy variables
point to a closed loopback port; this is not described as a firewall guarantee.
The Alpine CI container additionally runs without a network. Child processes
are bounded and temporary fixtures are removed after the checks.

The CLI suite is wired into the Node 22 frontend gate and actual Alpine builder.
Existing full build/browser/image gates remain enabled. Windows native checks
are local; Linux/Alpine checks must pass in CI. ARM platform versions are pinned
but not claimed to have been executed by these x64 probes. Full local Supabase
stack startup and hosted operations are outside this validation.

```sh
cd bertel-tourism-ui
npm ci --legacy-peer-deps
npm run test:supabase-cli
```

The compared npm reports move from 43 to 41 affected package rows and high rows
from 10 to 8. Other advisories remain. Neither dependency metadata nor the npm
`dev` flag proves absence of operational risk. No clean-audit claim, deployment,
production configuration change or hosted database operation is included.
