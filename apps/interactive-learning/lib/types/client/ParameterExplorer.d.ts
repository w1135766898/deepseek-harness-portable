import type { ActivityRendererProps } from './types.ts';
type ParameterActivity = Extract<ActivityRendererProps['activity'], {
    kind: 'parameter_explorer';
}>;
export declare function ParameterExplorer({ activity, busy, onSubmit, t }: ActivityRendererProps<ParameterActivity>): import("react").JSX.Element;
export {};
//# sourceMappingURL=ParameterExplorer.d.ts.map