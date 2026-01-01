# Export Feature Known Issues

## HOT_AND_ARCHIVED Export - Stream Closing Prematurely

**Status:** Not blocking release - can be fixed later

**Issue:**
When exporting `HOT_AND_ARCHIVED` data, the combined stream closes prematurely before archived data can be pushed to the client, resulting in empty files even though data is processed successfully.

**Symptoms:**
- Logs show data is being processed: "ARCHIVED export: Pushing JSONL line to stream"
- Logs show "stream closed prematurely" before archived data reaches client
- Downloaded file is empty (0 bytes)
- Individual `HOT` and `ARCHIVED` exports work correctly

**Root Cause:**
The `streamHotAndArchivedData` function creates a combined `PassThrough` stream that:
1. Streams HOT data first
2. When HOT ends (especially if empty), starts ARCHIVED stream asynchronously
3. Fastify closes the connection before ARCHIVED stream can push data

**Attempted Fixes:**
- Added `combinedStream.resume()` to keep stream flowing
- Removed premature `checkComplete()` calls
- Changed event handlers from `once` to `on` with guards
- Switched from `reply.send(stream)` to `stream.pipe(reply.raw)` and back

**Next Steps (for future):**
1. Consider pre-processing all data before streaming (for small archives)
2. Use a different streaming pattern that ensures connection stays open
3. Add connection keep-alive or explicit stream management
4. Consider using Fastify's built-in streaming capabilities differently

**Workaround:**
Users can export HOT and ARCHIVED separately and combine the results client-side.

**Files:**
- `services/api/src/routes/v1/exports.ts` - `streamHotAndArchivedData()` function (line ~815)
