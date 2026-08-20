/**
 * State controller for the VisionCard settings UI.
 * Connects SettingsScope<VisionSettings> to the React view model.
 * @module @dsh-portable/vision-bridge/client/vision-card-controller
 */

import {
  createSnapshotStore,
  type SettingsScope,
  type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { VisionConfig } from '../types.ts'
import { describeVisionRoute, type VisionRouteSummary } from './vision-route.ts'

export interface VisionSettings extends VisionConfig {}

/** Field defaults mirroring the host schema, so an unset value renders the same on both sides. */
const DEFAULTS = {
  enabled: true,
  model: '',
} as const satisfies Required<VisionSettings>

export interface VisionCardState {
  available: boolean
  writable: boolean
  dirty: boolean
  saving: boolean
  failed: boolean
  enabled: boolean
  model: string
  route: VisionRouteSummary
}

export interface VisionCardFace {
  hooks: {
    visionCard: SnapshotStore<VisionCardState>
  }
  edit: (field: keyof VisionSettings, value: unknown) => void
  save: () => Promise<void>
  discard: () => void
  useAutomaticModel: () => void
}

export class VisionCardController {
  private readonly store: SnapshotStore<VisionCardState>
  private staged: Partial<VisionSettings> = {}
  private saving = false
  private failed = false

  constructor(private readonly scope: SettingsScope<VisionSettings>) {
    this.store = createSnapshotStore<VisionCardState>(this.projection())
    this.scope.subscribe(() => {
      this.store.set(this.projection())
    })
  }

  /** Staged edit, then stored value, then the schema default. */
  private field<K extends keyof typeof DEFAULTS>(current: VisionSettings, key: K): (typeof DEFAULTS)[K] {
    const staged = this.staged[key]
    if (typeof staged === typeof DEFAULTS[key]) return staged as (typeof DEFAULTS)[K]
    const stored = current[key]
    if (typeof stored === typeof DEFAULTS[key]) return stored as (typeof DEFAULTS)[K]
    return DEFAULTS[key]
  }

  private projection(): VisionCardState {
    const snap = this.scope.getSnapshot()
    const current = (snap.value ?? {}) as VisionSettings
    const enabled = this.field(current, 'enabled')
    const model = this.field(current, 'model')

    return {
      available: snap.status === 'ready' || snap.status === 'loading',
      writable: snap.writable,
      dirty: Object.keys(this.staged).length > 0,
      saving: this.saving,
      failed: this.failed,
      enabled,
      model,
      route: describeVisionRoute(enabled, model),
    }
  }

  edit = (field: keyof VisionSettings, value: unknown): void => {
    this.staged[field] = value as never
    this.failed = false
    this.store.set(this.projection())
  }

  /** Clear the model pin so the host discovers an image-capable model itself. */
  useAutomaticModel = (): void => {
    this.staged.model = ''
    this.failed = false
    this.store.set(this.projection())
  }

  discard = (): void => {
    this.staged = {}
    this.failed = false
    this.store.set(this.projection())
  }

  save = async (): Promise<void> => {
    if (Object.keys(this.staged).length === 0 || this.saving) return
    this.saving = true
    this.failed = false
    this.store.set(this.projection())

    try {
      for (const [key, value] of Object.entries(this.staged)) {
        await this.scope.set(key, value)
      }
      this.staged = {}
    } catch (_err) {
      this.failed = true
    } finally {
      this.saving = false
      this.store.set(this.projection())
    }
  }

  inject(): VisionCardFace {
    return {
      hooks: {
        visionCard: this.store,
      },
      edit: this.edit,
      save: this.save,
      discard: this.discard,
      useAutomaticModel: this.useAutomaticModel,
    }
  }
}
