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

export interface VisionCardState {
  available: boolean
  writable: boolean
  dirty: boolean
  saving: boolean
  failed: boolean
  enabled: boolean
  provider: string
  model: string
  baseURL: string
  apiKey: string
  prompt: string
  route: VisionRouteSummary
}

export interface VisionCardFace {
  hooks: {
    visionCard: SnapshotStore<VisionCardState>
  }
  edit: (field: keyof VisionSettings, value: unknown) => void
  save: () => Promise<void>
  discard: () => void
  selectProviderPreset: (preset: 'openai' | 'ollama' | 'compatible') => void
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

  private projection(): VisionCardState {
    const snap = this.scope.getSnapshot()
    const current = (snap.value ?? {}) as VisionSettings

    const enabled = typeof this.staged.enabled === 'boolean'
      ? this.staged.enabled
      : (current.enabled ?? true)

    const provider = typeof this.staged.provider === 'string'
      ? this.staged.provider
      : (current.provider ?? 'compatible')

    const model = typeof this.staged.model === 'string'
      ? this.staged.model
      : (current.model ?? 'gpt-4o-mini')

    const baseURL = typeof this.staged.baseURL === 'string'
      ? this.staged.baseURL
      : (current.baseURL ?? 'https://api.openai.com/v1')

    const apiKey = typeof this.staged.apiKey === 'string'
      ? this.staged.apiKey
      : ''

    const prompt = typeof this.staged.prompt === 'string'
      ? this.staged.prompt
      : (current.prompt ?? '')

    const dirty = Object.keys(this.staged).length > 0

    return {
      available: snap.status === 'ready' || snap.status === 'loading',
      writable: snap.writable,
      dirty,
      saving: this.saving,
      failed: this.failed,
      enabled,
      provider,
      model,
      baseURL,
      apiKey,
      prompt,
      route: describeVisionRoute(enabled, baseURL),
    }
  }

  edit = (field: keyof VisionSettings, value: unknown): void => {
    this.staged[field] = value as never
    this.failed = false
    this.store.set(this.projection())
  }

  selectProviderPreset = (preset: 'openai' | 'ollama' | 'compatible'): void => {
    this.staged.provider = preset
    if (preset === 'openai') {
      this.staged.baseURL = 'https://api.openai.com/v1'
      this.staged.model = 'gpt-4o-mini'
    } else if (preset === 'ollama') {
      this.staged.baseURL = 'http://127.0.0.1:11434/v1'
      this.staged.model = 'llava'
    }
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
        if (key === 'apiKey' && (value === '' || value === undefined)) {
          // Do not overwrite secret if user left apiKey blank in edit
          continue
        }
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
      selectProviderPreset: this.selectProviderPreset,
    }
  }
}
