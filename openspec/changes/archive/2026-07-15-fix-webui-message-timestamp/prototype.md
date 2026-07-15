## Prototype Status

No prototype needed — minimal UI change. The only visual change is replacing a hardcoded `"09:41"` string with a dynamic `toLocaleTimeString()` value derived from `message.createdAt`. No new components, pages, layout shifts, or style changes. The meta line structure (`"You · HH:MM"` / `"dscode · HH:MM"`) remains identical; only the time value source changes from static to data-driven.

When `createdAt` is absent (legacy history), the meta line condenses to just the role label (`"You"` / `"dscode"`) without the separator or time — a minor visual simplification within the existing design system.
