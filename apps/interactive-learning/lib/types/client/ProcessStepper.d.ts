import type { ActivityRendererProps } from './types.ts';
type ProcessActivity = Extract<ActivityRendererProps['activity'], {
    kind: 'process_stepper';
}>;
export declare function ProcessStepper({ activity, busy, onSubmit, t }: ActivityRendererProps<ProcessActivity>): import("react").JSX.Element;
export {};
//# sourceMappingURL=ProcessStepper.d.ts.map