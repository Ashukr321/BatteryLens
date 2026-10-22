# BatteryLens: npm par publish kaise karein

Saari commands **root folder** (`BatteryLens/`) se chalao. `-w batterylens` ka matlab hai command sirf `packages/cli` wale package par chalegi. Root package `private: true` hai, isliye root me `-w` ke bina `npm publish` mat chalana, warna error aayega.

## 0. Ek baar ka setup

```bash
npm login
npm whoami        # apna username dikhna chahiye
npm view batterylens   # "404 Not Found" = naam free hai
```

## 1. Build + test

```bash
npm install
npm run build     # dashboard build → packages/cli/dashboard me copy → CLI tsc
npm test
```

## 2. Local check (publish se pehle zaroor)

```bash
cd packages/cli && npm pack
npx ./batterylens-0.1.0.tgz
```

Dashboard sahi khule to `.tgz` file delete kar do aur root par wapas aao.

## 3. Publish

### Option A: Beta (recommended, pehli release ke liye)

`npx batterylens` beta version nahi uthayega; testers `npx batterylens@beta` chalayenge.

```bash
npm version 0.1.0-beta.0 -w batterylens --no-git-tag-version
npm run build
npm publish -w batterylens --tag beta --access public
```

### Option B: Latest

Sabke `npx batterylens` me turant aayega.

```bash
npm publish -w batterylens --access public
```

> 2FA on hai to npm OTP maangega, ya `--otp=123456` laga do.
> `npm version` ke baad `npm run build` dobara chalao, kyunki sidebar ka version build time pe dashboard me jaata hai.

## 4. Verify

```bash
npx batterylens@beta      # Option A
npx batterylens@latest    # Option B
```

## 5. Beta → latest promote karna

```bash
npm version 0.1.0 -w batterylens --no-git-tag-version
npm run build
npm publish -w batterylens --access public
```

## Aage ki releases

> Error `You cannot publish over the previously published versions` = wahi version pehle se npm par hai. Pehle version badhao.

Kaunsa bump?

| Change | Command | Example |
|---|---|---|
| Bug fix | `npm version patch` | 0.1.1 → 0.1.2 |
| Naya feature | `npm version minor` | 0.1.2 → 0.2.0 |
| Breaking change | `npm version major` | 0.2.0 → 1.0.0 |

```bash
npm version patch -w batterylens --no-git-tag-version
# packages/cli/CHANGELOG.md me naya section likho
npm run build      # zaroori: sidebar + --version naya version tabhi dikhayenge
npm test
npm publish -w batterylens --access public
npm view batterylens version   # naya version dikhna chahiye
```

Version ek hi jagah se aata hai: `packages/cli/package.json`. CLI `--version` aur dashboard sidebar dono wahi padhte hain, kahin aur hard-code mat karo.

Commit: `chore(release): batterylens <version>`

## Alternative: package folder se publish

```bash
npm run build                 # root se
cd packages/cli
npm publish --tag beta --access public
```

## Dhyan rahe

- Ek version number sirf ek baar publish hota hai. Unpublish ke baad bhi wahi number dobara use nahi hoga, isliye step 2 skip mat karo.
- `install` / `uninstall` aur macOS abhi tak sirf likhe gaye hain, real machine pe test nahi hue. Pehle beta se test karo.
