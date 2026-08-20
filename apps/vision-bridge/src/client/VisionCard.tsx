/**
 * Visual settings card registered into `settings.plugin.item`.
 * @module @dsh-portable/vision-bridge/client/VisionCard
 */

import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { VisionCardFace } from './vision-card-controller.ts'
import type { VisionRouteKind } from './vision-route.ts'
import type {} from './locales.ts'
import css from './VisionCard.module.css'

export type VisionCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'vision-bridge'>
  & InjectFace<VisionCardFace>

/** Locale key triplet describing one selection state. */
const ROUTE_COPY = {
  auto: { badge: 'routeAuto', title: 'routeAutoTitle', hint: 'routeAutoHint' },
  pinned: { badge: 'routePinned', title: 'routePinnedTitle', hint: 'routePinnedHint' },
  disabled: { badge: 'routeDisabled', title: 'routeDisabledTitle', hint: 'routeDisabledHint' },
} as const satisfies Record<VisionRouteKind, { badge: string; title: string; hint: string }>

export function VisionCard(props: VisionCardProps) {
  const [open, setOpen] = useState(false)
  const { t } = props

  const state = props.useVisionCard(snapshot => snapshot)

  if (!state.available) return null

  const title = t('cardTitle')
  const desc = t('cardDescription')
  const blocked = !state.dirty || state.saving || !state.writable
  const copy = ROUTE_COPY[state.route.kind]
  const selection = state.route.model ?? ''

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
        <span className={`${css.routeBadge} ${css[`route_${state.route.kind}`]}`}>
          {t(copy.badge)}
        </span>
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

          <div
            className={`${css.routeSummary} ${css.nativeRoute}`}
            data-route="shared-providers"
            role="status"
          >
            <span className={css.routeDot} aria-hidden="true" />
            <span className={css.routeText}>
              <strong>{t('sharedProviderTitle')}</strong>
              <span>{t('sharedProviderHint')}</span>
            </span>
          </div>

          <div
            className={`${css.routeSummary} ${css[`route_${state.route.kind}`]}`}
            data-route={state.route.kind}
            role="status"
            aria-live="polite"
          >
            <span className={css.routeDot} aria-hidden="true" />
            <span className={css.routeText}>
              <strong>{t(copy.title)}</strong>
              <span>{t(copy.hint)}</span>
              {selection !== '' && <code>{selection}</code>}
            </span>
          </div>

          {/* 1. Enable switch */}
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

          {/* 2. Model pin (empty = discover an image-capable model) */}
          <div className={css.field}>
            <label className={css.label}>{t('model')}</label>
            <input
              type="text"
              className={css.input}
              value={state.model}
              disabled={!state.writable}
              placeholder={t('modelPlaceholder')}
              onChange={e => props.edit('model', e.target.value)}
            />
            <span className={css.hint}>{t('modelHint')}</span>
          </div>

          {state.route.kind === 'pinned' && (
            <button
              type="button"
              className={`${css.btn} ${css.discard}`}
              disabled={!state.writable}
              onClick={props.useAutomaticModel}
            >
              {t('useAutomatic')}
            </button>
          )}

          {/* Footer actions */}
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
