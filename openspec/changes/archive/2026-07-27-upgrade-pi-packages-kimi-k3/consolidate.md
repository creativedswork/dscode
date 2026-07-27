## 变更综述

本次变更将 pi-ai、pi-agent-core、pi-tui 三个核心依赖从 0.80.3/0.80.3/0.74.0 统一升级到 0.80.10，并启用 kimi-k3 模型支持。

## 变更时间线

- 2026-07-17: upgrade-pi-packages-kimi-k3 — 初始变更，版本升级 + k3 支持

## 初始设计

见 proposal.md — 升级 pi 系列包到最新版本，解锁 kimi-k3 内置模型。

## 变更记录

（首次创建，无历史变更）

## 修复记录

（无相关修复记录）

## 最终状态

见 proposal.md — 三个包统一升级到 `^0.80.10`，`getThinkingLevel` 更新以处理 k3 的 max-only thinking 级别映射。
