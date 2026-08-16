/**
 * Visual settings card registered into `settings.plugin.item`.
 * @module @dsh-portable/vision-bridge/client/VisionCard
 */

import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { VisionCardFace } from './vision-card-controller.ts'
import type {} from './locales.ts'
import css from './VisionCard.module.css'

export type VisionCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'vision-bridge'>
  & InjectFace<VisionCardFace>

export function VisionCard(props: VisionCardProps) {
  const [open, setOpen] = useState(false)
  const { t } = props

  const state = props.useVisionCard(snapshot => snapshot)

  if (!state.available) return null

  const title = t('cardTitle')
  const desc = t('cardDescription')
  const blocked = !state.dirty || state.saving || !state.writable

  return (
    <li className={`${css.card} ${open ? css.cardOpen : ''}`}>
      <button
        type="button"
        className={css.header}
        aria-expanded={open}
        aria-label={`${t(open ? 'collapse' : 'expand')}: ${title}`}
        onClick={() => setOpen(!open)}
      >
        <span className={css.headText}>
          <span className={css.name}>{title}</span>
          <span className={css.description}>{desc}</span>
        </span>
        {state.dirty && <span className={css.pending}>{t('unsaved')}</span>}
        <svg
          className={`${css.chevron} ${open ? css.chevronOpen : ''}`}
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className={css.body}>
          {!state.writable && (
            <p className={css.readOnly} role="status">{t('readOnly')}</p>
          )}

          {/* 1. Enable Switch */}
          <div className={css.fieldRow}>
            <div>
              <div className={css.label}>{t('enabled')}</div>
              <div className={css.hint}>{t('enabledHint')}</div>
            </div>
            <label className={css.switch}>
              <input
                type="checkbox"
                checked={state.enabled}
                disabled={!state.writable}
                onChange={e => props.edit('enabled', e.target.checked)}
              />
              <span className={css.slider} />
            </label>
          </div>

          {/* 2. Provider Preset Selection */}
          <div className={css.field}>
            <label className={css.label}>{t('provider')}</label>
            <select
              className={css.select}
              value={state.provider}
              disabled={!state.writable}
              onChange={e => props.selectProviderPreset(e.target.value as 'openai' | 'ollama' | 'compatible')}
            >
              <option value="compatible">{t('providerCompatible')}</option>
              <option value="openai">{t('providerOpenAI')}</option>
              <option value="ollama">{t('providerOllama')}</option>
            </select>
          </div>

          {/* 3. Base URL */}
          <div className={css.field}>
            <label className={css.label}>{t('baseURL')}</label>
            <input
              type="text"
              className={css.input}
              value={state.baseURL}
              disabled={!state.writable}
              placeholder="https://api.openai.com/v1"
              onChange={e => props.edit('baseURL', e.target.value)}
            />
            <span className={css.hint}>{t('baseURLHint')}</span>
          </div>

          {/* 4. Model Name */}
          <div className={css.field}>
            <label className={css.label}>{t('model')}</label>
            <input
              type="text"
              className={css.input}
              value={state.model}
              disabled={!state.writable}
              placeholder="gpt-4o-mini"
              onChange={e => props.edit('model', e.target.value)}
            />
            <span className={css.hint}>{t('modelHint')}</span>
          </div>

          {/* 5. API Key */}
          <div className={css.field}>
            <label className={css.label}>
              {t('apiKey')} ({state.hasStoredKey ? t('apiKeySet') : t('apiKeyUnset')})
            </label>
            <input
              type="password"
              className={css.input}
              value={state.apiKey}
              disabled={!state.writable}
              placeholder={state.hasStoredKey ? '••••••••••••••••' : t('apiKeyHint')}
              onChange={e => props.edit('apiKey', e.target.value)}
            />
            <span className={css.hint}>{t('apiKeyHint')}</span>
          </div>

          {/* 6. Prompt Override (Optional) */}
          <div className={css.field}>
            <label className={css.label}>{t('promptOverride')}</label>
            <textarea
              className={css.textarea}
              rows={2}
              value={state.prompt}
              disabled={!state.writable}
              placeholder={t('promptOverrideHint')}
              onChange={e => props.edit('prompt', e.target.value)}
            />
          </div>

          {/* Footer Actions */}
          <div className={css.footer}>
            {state.failed && (
              <span className={`${css.statusMsg} ${css.error}`}>
                {t('saveFailed')}
              </span>
            )}
            <button
              type="button"
              className={`${css.btn} ${css.discard}`}
              disabled={!state.dirty || state.saving}
              onClick={props.discard}
            >
              {t('discard')}
            </button>
            <button
              type="button"
              className={`${css.btn} ${css.save}`}
              disabled={blocked}
              onClick={props.save}
            >
              {t(state.saving ? 'saving' : 'save')}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
