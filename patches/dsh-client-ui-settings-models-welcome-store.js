/**
 * Patch the generated welcome-notice store in the packaged runtime.
 *
 * The desktop wrapper is intentionally source-light: the upstream workspace
 * packages are materialized by `pnpm deploy`, so this patch is applied after
 * deployment and before Electron/pkg packaging. The marker check is strict so
 * an upstream bundle change fails the build instead of silently dropping the
 * onboarding retry behavior.
 */

const CLASS_MARKER = 'var WelcomeNoticeStore = class {'
const FOLLOWING_MARKER = 'Refresh only after welcome state has left idle'

/**
 * Add bounded exponential retries for settings reads and acknowledgement
 * writes. The retry is process-local and capped at five seconds between
 * attempts; a transient host activation race therefore cannot strand the
 * onboarding modal in its error state.
 *
 * @param {string} source - generated dsh-client-ui-settings-models bundle.
 * @returns {string} patched bundle.
 */
export function patchWelcomeNoticeStore(source) {
  const start = source.indexOf(CLASS_MARKER)
  const following = source.indexOf(FOLLOWING_MARKER, start + CLASS_MARKER.length)
  if (start < 0 || following < 0) {
    throw new Error('welcome-notice store bundle marker not found')
  }
  const classEnd = source.lastIndexOf('\n\t\t};', following)
  if (classEnd < start) {
    throw new Error('welcome-notice store class terminator not found')
  }

  const replacement = `var WelcomeNoticeStore = class {
\t\t\tapi;
\t\t\tpersistence;
\t\t\t/** uSES-safe state source shared by the registered welcome step. */
\t\t\tstore = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)({
\t\t\t\tstatus: "idle",
\t\t\t\tacknowledged: false,
\t\t\t\terror: null
\t\t\t});
\t\t\tgeneration = 0;
\t\t\tretryTimer = void 0;
\t\t\tretryAttempt = 0;
\t\t\tconstructor(api, persistence = "host") {
\t\t\t\tthis.api = api;
\t\t\t\tthis.persistence = persistence;
\t\t\t}
\t\t\tcancelRetry() {
\t\t\t\tif (this.retryTimer !== void 0) {
\t\t\t\t\tclearTimeout(this.retryTimer);
\t\t\t\t\tthis.retryTimer = void 0;
\t\t\t\t}
\t\t\t}
\t\t\tscheduleRetry(operation) {
\t\t\t\tthis.cancelRetry();
\t\t\t\tconst delay = Math.min(5e3, 250 * 2 ** this.retryAttempt++);
\t\t\t\tthis.retryTimer = setTimeout(() => {
\t\t\t\t\tthis.retryTimer = void 0;
\t\t\t\t\tvoid operation();
\t\t\t\t}, delay);
\t\t\t}
\t\t\tasync load() {
\t\t\t\tthis.cancelRetry();
\t\t\t\tconst generation = ++this.generation;
\t\t\t\tif (this.persistence === "memory") {
\t\t\t\t\tthis.store.update((state) => {
\t\t\t\t\t\tstate.status = "ready";
\t\t\t\t\t\tstate.error = null;
\t\t\t\t\t});
\t\t\t\t\tthis.retryAttempt = 0;
\t\t\t\t\treturn;
\t\t\t\t}
\t\t\t\tthis.store.update((state) => {
\t\t\t\t\tstate.status = "loading";
\t\t\t\t\tstate.error = null;
\t\t\t\t});
\t\t\t\ttry {
\t\t\t\t\tconst response = await this.api.settings.describe({});
\t\t\t\t\tif (!response.result.ok) throw new Error(response.result.error.message);
\t\t\t\t\tconst view = response.result.value.namespaces.find((candidate) => candidate.ns === WELCOME_NOTICE_SETTINGS_NAMESPACE);
\t\t\t\t\tif (view === void 0) throw new Error("welcome acknowledgement settings are unavailable");
\t\t\t\t\tif (generation !== this.generation) return;
\t\t\t\t\tthis.store.update((state) => {
\t\t\t\t\t\tstate.status = "ready";
\t\t\t\t\t\tstate.acknowledged = acknowledgementOf(view) === WELCOME_NOTICE_VERSION;
\t\t\t\t\t\tstate.error = null;
\t\t\t\t\t});
\t\t\t\t\tthis.retryAttempt = 0;
\t\t\t\t} catch (error) {
\t\t\t\t\tif (generation !== this.generation) return;
\t\t\t\t\tthis.store.update((state) => {
\t\t\t\t\t\tstate.status = "error";
\t\t\t\t\t\tstate.acknowledged = false;
\t\t\t\t\t\tstate.error = messageOf(error);
\t\t\t\t\t});
\t\t\t\t\tthis.scheduleRetry(() => this.load());
\t\t\t\t}
\t\t\t}
\t\t\tasync acknowledge() {
\t\t\t\tthis.cancelRetry();
\t\t\t\tconst generation = ++this.generation;
\t\t\t\tif (this.persistence === "memory") {
\t\t\t\t\tthis.store.update((state) => {
\t\t\t\t\t\tstate.status = "ready";
\t\t\t\t\t\tstate.acknowledged = true;
\t\t\t\t\t\tstate.error = null;
\t\t\t\t\t});
\t\t\t\t\tthis.retryAttempt = 0;
\t\t\t\t\treturn true;
\t\t\t\t}
\t\t\t\tthis.store.update((state) => {
\t\t\t\t\tstate.status = "saving";
\t\t\t\t\tstate.error = null;
\t\t\t\t});
\t\t\t\ttry {
\t\t\t\t\tconst response = await this.api.settings.mutate({
\t\t\t\t\t\tns: WELCOME_NOTICE_SETTINGS_NAMESPACE,
\t\t\t\t\t\tops: [{
\t\t\t\t\t\t\top: "set",
\t\t\t\t\t\t\tpath: [WELCOME_NOTICE_ACK_FIELD],
\t\t\t\t\t\t\tvalue: WELCOME_NOTICE_VERSION
\t\t\t\t\t\t}]
\t\t\t\t\t});
\t\t\t\t\tif (!response.result.ok) throw new Error(response.result.error.message);
\t\t\t\t\tif (generation === this.generation) this.store.update((state) => {
\t\t\t\t\t\tstate.status = "ready";
\t\t\t\t\t\tstate.acknowledged = true;
\t\t\t\t\t\tstate.error = null;
\t\t\t\t\t});
\t\t\t\t\tthis.retryAttempt = 0;
\t\t\t\t\treturn true;
\t\t\t\t} catch (error) {
\t\t\t\t\tif (generation === this.generation) this.store.update((state) => {
\t\t\t\t\t\tstate.status = "error";
\t\t\t\t\t\tstate.acknowledged = false;
\t\t\t\t\t\tstate.error = messageOf(error);
\t\t\t\t\t});
\t\t\t\t\tthis.scheduleRetry(() => this.acknowledge());
\t\t\t\t\treturn false;
\t\t\t\t}
\t\t\t}
\t\t};`

  return source.slice(0, start) + replacement + source.slice(classEnd + '\n\t\t};'.length)
}
