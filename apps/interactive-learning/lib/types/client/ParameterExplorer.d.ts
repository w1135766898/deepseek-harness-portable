import type { ParameterExplorerPayloadV1 } from '../protocol.ts';
import type { ActivityRendererProps } from './types.ts';
type ParameterActivity = Extract<ActivityRendererProps['activity'], {
    kind: 'parameter_explorer';
}>;
/** V2 current-frame parameter visual. It deliberately owns no teaching prompt or answer. */
export declare function ParameterRoundVisual({ payload, disabled, t, }: {
    payload: Pick<ParameterExplorerPayloadV1, 'parameters' | 'xAxis' | 'curves'>;
    disabled: boolean;
    t: ActivityRendererProps['t'];
}): import("react").JSX.Element;
export declare function ParameterExplorer({ activity, busy, onSubmit, t }: ActivityRendererProps<ParameterActivity>): import("react").JSX.Element;
export {};
//# sourceMappingURL=ParameterExplorer.d.ts.map