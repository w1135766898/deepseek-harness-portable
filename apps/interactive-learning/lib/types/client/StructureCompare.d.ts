import type { ActivityRendererProps } from './types.ts';
type CompareActivity = Extract<ActivityRendererProps['activity'], {
    kind: 'structure_compare';
}>;
export declare function StructureCompare({ activity, busy, onSubmit, t }: ActivityRendererProps<CompareActivity>): import("react").JSX.Element;
export {};
//# sourceMappingURL=StructureCompare.d.ts.map