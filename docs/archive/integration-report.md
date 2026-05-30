# Integration Report: DSCode → awesome-deepseek-agent

## Overview

Submitted DSCode as a new integration guide to [awesome-deepseek-agent](https://github.com/deepseek-ai/awesome-deepseek-agent), the official community knowledge base for DeepSeek tool integrations.

- **Date:** 2026-05-08
- **Branch:** `develop`
- **Target Repo:** `awesome-deepseek-agent`

## Changes Made

### 1. New Guide Files (awesome-deepseek-agent)

| File | Description |
|------|-------------|
| `docs/dscode.md` | English integration guide — install, configure, run |
| `docs/dscode.zh-CN.md` | Simplified Chinese integration guide |

Both guides cover:
- Prerequisites (Node.js 20.6+, DeepSeek API Key)
- Installation (git clone + npm install)
- Configuration (`.env`, user `config.json`, and user/project `settings.json`)
- Model and thinking mode setup (`modelId`, `thinkingLevel`, `maxTokens`)
- 1M context window note
- Running and slash commands reference

### 2. README Table Updates (awesome-deepseek-agent)

| File | Change |
|------|--------|
| `README.md` | Added DSCode row in alphabetical order (between DeepSeek-TUI and GitHub Copilot) |
| `README.zh-CN.md` | Added DSCode row in alphabetical order |

### 3. dscode Project Adjustments for Compliance

#### `src/core/config.ts` (line 68-73)

Previously hardcoded: `thinkingLevel = modelId.includes("pro") ? "medium" : "off"`

Now configurable with three-level priority:
1. `AGENT_THINKING_LEVEL` env var
2. `thinkingLevel` in `config.json` (user or project level)
3. Default heuristic (pro → medium, flash → off)

This satisfies CONTRIBUTING.md rule: **Max Thinking / Reasoning Effort** — `thinkingLevel: "xhigh"` maps to `reasoning_effort: "max"` for optimal DeepSeek V4 Pro coding experience.

#### `README.md`

Added 1M context window section under model configuration table, satisfying CONTRIBUTING.md rule: **1M Context Window** — documents that DeepSeek V4 models support 1M context and pi-ai handles it automatically.

Added `thinkingLevel` to config reference tables and environment variables table.

Added **思考模式配置** (Thinking Mode Configuration) section explaining:
- DeepSeek API parameter mapping (`thinkingLevel` → `thinking` + `reasoning_effort`)
- All supported levels and their DeepSeek API equivalents

## CONTRIBUTING.md Compliance Checklist

### Agent Configuration

- [x] **Model naming** — Uses `deepseek-v4-pro` / `deepseek-v4-flash` (current names)
- [x] **1M context** — Documented in both guide and dscode README; pi-ai auto-configures `contextWindow: 1000000`
- [x] **Max thinking effort** — `thinkingLevel: "xhigh"` supported via env var or config file, maps to `reasoning_effort: "max"`
- [x] **Pricing** — Not included in guide (no pricing table present)
- [x] **Config fields verified** — All documented fields exist and are functional
- [x] **No upstream workarounds** — Guide recommends `xhigh` for max performance, not disabling thinking

### Documentation

- [x] **Bilingual** — Both `dscode.md` and `dscode.zh-CN.md` included
- [x] **Alphabetical table entry** — DSCode inserted between DeepSeek-TUI and GitHub Copilot in both README tables
- [x] **One tool per PR** — Only DSCode guides included
- [x] **No images needed**

## PR Summary

A single commit covering:
1. Two bilingual guide files in `docs/`
2. README table entries in alphabetical order
3. dscode project updates: configurable `thinkingLevel`, 1M context docs

## Files Affected

### awesome-deepseek-agent
- `docs/dscode.md` (new)
- `docs/dscode.zh-CN.md` (new)
- `README.md` (modified)
- `README.zh-CN.md` (modified)

### dscode (this repo)
- `src/core/config.ts` (modified)
- `README.md` (modified)
