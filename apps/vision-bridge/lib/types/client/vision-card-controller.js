/**
 * State controller for the VisionCard settings UI.
 * Connects SettingsScope<VisionSettings> to the React view model.
 * @module @dsh-portable/vision-bridge/client/vision-card-controller
 */
import { createSnapshotStore, } from '@deepseek-ai/dsh-client-runtime/client';
import { describeVisionRoute } from "./vision-route.js";
/** Field defaults mirroring the host schema, so an unset value renders the same on both sides. */
const DEFAULTS = {
    enabled: true,
    model: '',
};
export class VisionCardController {
    scope;
    store;
    staged = {};
    saving = false;
    failed = false;
    constructor(scope) {
        this.scope = scope;
        this.store = createSnapshotStore(this.projection());
        this.scope.subscribe(() => {
            this.store.set(this.projection());
        });
    }
    /** Staged edit, then stored value, then the schema default. */
    field(current, key) {
        const staged = this.staged[key];
        if (typeof staged === typeof DEFAULTS[key])
            return staged;
        const stored = current[key];
        if (typeof stored === typeof DEFAULTS[key])
            return stored;
        return DEFAULTS[key];
    }
    projection() {
        const snap = this.scope.getSnapshot();
        const current = (snap.value ?? {});
        const enabled = this.field(current, 'enabled');
        const model = this.field(current, 'model');
        return {
            available: snap.status === 'ready' || snap.status === 'loading',
            writable: snap.writable,
            dirty: Object.keys(this.staged).length > 0,
            saving: this.saving,
            failed: this.failed,
            enabled,
            model,
            route: describeVisionRoute(enabled, model),
        };
    }
    edit = (field, value) => {
        this.staged[field] = value;
        this.failed = false;
        this.store.set(this.projection());
    };
    /** Clear the model pin so the host discovers an image-capable model itself. */
    useAutomaticModel = () => {
        this.staged.model = '';
        this.failed = false;
        this.store.set(this.projection());
    };
    discard = () => {
        this.staged = {};
        this.failed = false;
        this.store.set(this.projection());
    };
    save = async () => {
        if (Object.keys(this.staged).length === 0 || this.saving)
            return;
        this.saving = true;
        this.failed = false;
        this.store.set(this.projection());
        try {
            for (const [key, value] of Object.entries(this.staged)) {
                await this.scope.set(key, value);
            }
            this.staged = {};
        }
        catch (_err) {
            this.failed = true;
        }
        finally {
            this.saving = false;
            this.store.set(this.projection());
        }
    };
    inject() {
        return {
            hooks: {
                visionCard: this.store,
            },
            edit: this.edit,
            save: this.save,
            discard: this.discard,
            useAutomaticModel: this.useAutomaticModel,
        };
    }
}
//# sourceMappingURL=vision-card-controller.js.map