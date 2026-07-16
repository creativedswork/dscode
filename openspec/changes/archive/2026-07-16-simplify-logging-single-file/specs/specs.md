## Modified Specs

### chiff-progress-display — Update logger call examples

Remove channel parameter `"analysis"` from all `logger.info(...)` calls in spec examples.

**Before:**
```
logger.info("analysis", "Phase0", "start")
```

**After:**
```
logger.info("Phase0", "start")
```

### eval-progress-feedback — Update logger call examples  

Remove channel parameter `"analysis"` from all `logger.error(...)` calls in spec examples.

**Before:**
```
logger.error("analysis", "Pipeline", "crash: <message>")
```

**After:**
```
logger.error("Pipeline", "crash: <message>")
```
