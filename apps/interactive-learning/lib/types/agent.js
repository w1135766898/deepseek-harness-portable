import { defineTool, } from '@deepseek-ai/dsh-tools';
import { VISUAL_PROTOCOL_V4, VISUAL_RESULT_PROTOCOL_V4, MAX_VISUAL_MATH_DEPTH, MATH_BINARY_OPERATORS, MATH_UNARY_OPERATORS, parseLearningVisualV4, } from "./protocol.js";
export const name = 'interactive-learning-agent';
export const inject = ['tools', 'systemPrompt'];
function closeParameterRoot(tool) {
    return { ...tool, parameters: { ...tool.parameters, additionalProperties: false } };
}
const parameter = { type: 'object', additionalProperties: false, properties: {
        id: {
            type: 'string',
            description: 'Identifier: 1 to 32 characters, start with a lowercase letter, then use only a-z, 0-9, _ or -. The id x is reserved for the chart axis.',
            required: true,
        },
        label: { type: 'string', required: true },
        min: { type: 'number', required: true },
        max: { type: 'number', required: true },
        step: { type: 'number', required: true },
        initial: { type: 'number', required: true },
    } };
function mathExpressionSchema(depth) {
    const leaves = [
        { type: 'object', additionalProperties: false, properties: {
                op: { type: 'string', const: 'constant', required: true },
                value: { type: 'number', required: true },
            } },
        { type: 'object', additionalProperties: false, properties: {
                op: { type: 'string', const: 'variable', required: true },
                name: {
                    type: 'string',
                    description: 'Use x or one of this visual\'s parameter ids.',
                    required: true,
                },
            } },
    ];
    if (depth <= 1)
        return { oneOf: leaves };
    const nested = mathExpressionSchema(depth - 1);
    return { oneOf: [
            ...leaves,
            { type: 'object', additionalProperties: false, properties: {
                    op: {
                        type: 'string',
                        enum: MATH_UNARY_OPERATORS,
                        required: true,
                    },
                    value: { ...nested, required: true },
                } },
            { type: 'object', additionalProperties: false, properties: {
                    op: { type: 'string', enum: MATH_BINARY_OPERATORS, required: true },
                    left: { ...nested, required: true },
                    right: { ...nested, required: true },
                } },
        ] };
}
function required(schema) {
    return { ...schema, required: true };
}
// Shared with the runtime parser: enough for sigmoid(b0 + b1*x), still bounded.
const expression = mathExpressionSchema(MAX_VISUAL_MATH_DEPTH);
const requiredExpression = required(expression);
const identifier = {
    type: 'string',
    description: 'Identifier: 1 to 32 characters, start with a lowercase letter, then use only a-z, 0-9, _ or -.',
};
const tone = { type: 'string', enum: ['blue', 'green', 'red', 'orange', 'purple', 'gray'] };
const stroke = { type: 'string', enum: ['solid', 'dashed', 'dotted'] };
const point = { type: 'object', additionalProperties: false, properties: {
        x: { type: 'number', required: true },
        y: { type: 'number', required: true },
        label: { type: 'string' },
    } };
const coordinate = { type: 'object', additionalProperties: false, properties: {
        x: { type: 'number', required: true },
        y: { type: 'number', required: true },
    } };
const axis = { type: 'object', additionalProperties: false, properties: {
        label: { type: 'string' },
        min: { type: 'number', required: true },
        max: { type: 'number', required: true },
    } };
const curveSeries = { type: 'object', additionalProperties: false, properties: {
        type: { type: 'string', const: 'curve', required: true },
        id: { ...identifier, required: true },
        label: { type: 'string', required: true },
        expression: requiredExpression,
        tone,
        stroke,
    } };
const pointSeries = { type: 'object', additionalProperties: false, properties: {
        type: { type: 'string', const: 'points', required: true },
        id: { ...identifier, required: true },
        label: { type: 'string', required: true },
        points: { type: 'array', required: true, items: point, description: '1 to 256 points.' },
        tone,
    } };
const lineSeries = { type: 'object', additionalProperties: false, properties: {
        type: { type: 'string', const: 'line', required: true },
        id: { ...identifier, required: true },
        label: { type: 'string', required: true },
        points: { type: 'array', required: true, items: point, description: '1 to 256 points.' },
        tone,
        stroke,
    } };
const barSeries = { type: 'object', additionalProperties: false, properties: {
        type: { type: 'string', const: 'bars', required: true },
        id: { ...identifier, required: true },
        label: { type: 'string', required: true },
        points: { type: 'array', required: true, items: point, description: '1 to 64 bars.' },
        tone,
    } };
const plotContent = { type: 'object', additionalProperties: false, properties: {
        kind: {
            type: 'string', const: 'plot', required: true,
            description: 'Functions, quantitative data, probability, distributions, or tangent/secant geometry on Cartesian axes.',
        },
        parameters: {
            type: 'array', items: parameter,
            description: 'Optional; omit for a static plot. Use at most three only when changing the value teaches the mechanism.',
        },
        xAxis: { ...axis, required: true, properties: {
                ...axis.properties,
                samples: { type: 'integer', description: 'Optional curve samples from 24 to 256.' },
            } },
        yAxis: required(axis),
        series: {
            type: 'array', required: true, items: { oneOf: [curveSeries, pointSeries, lineSeries, barSeries] },
            description: '1 to 8 series.',
        },
        metrics: { type: 'array', items: {
                type: 'object', additionalProperties: false, properties: {
                    id: { ...identifier, required: true },
                    label: { type: 'string', required: true },
                    expression: requiredExpression,
                    digits: { type: 'integer' },
                    suffix: { type: 'string' },
                },
            }, description: 'Optional; at most 4 metrics.' },
    } };
const nodeGroup = { type: 'object', additionalProperties: false, properties: {
        id: { ...identifier, required: true },
        label: { type: 'string', required: true },
    } };
const node = { type: 'object', additionalProperties: false, properties: {
        id: { ...identifier, required: true },
        label: { type: 'string', required: true },
        detail: { type: 'string' },
        group: { type: 'string' },
        tone,
    } };
const edge = { type: 'object', additionalProperties: false, properties: {
        id: { ...identifier, required: true },
        from: { type: 'string', required: true },
        to: { type: 'string', required: true },
        label: { type: 'string' },
        detail: { type: 'string' },
        tone,
        stroke,
        directed: { type: 'boolean' },
    } };
const nodeLinkContent = { type: 'object', additionalProperties: false, properties: {
        kind: {
            type: 'string', const: 'node_link', required: true,
            description: 'Networks, fully connected layers, trees, causality, concept maps, state transitions, and dependency topology.',
        },
        layout: { type: 'string', enum: ['layered', 'hierarchy', 'radial'], required: true },
        groups: {
            type: 'array', items: nodeGroup,
            description: 'Optional 1 to 12 ordered layers for layered layout; every node must reference one group.',
        },
        nodes: { type: 'array', items: node, required: true, description: '2 to 48 nodes.' },
        edges: { type: 'array', items: edge, required: true, description: '1 to 160 edges; include every semantically required connection.' },
    } };
const sceneBase = {
    id: { ...identifier, required: true },
    label: { type: 'string' },
    detail: { type: 'string' },
    tone,
};
const sceneElement = { oneOf: [
        { type: 'object', additionalProperties: false, properties: {
                type: { type: 'string', const: 'point', required: true }, ...sceneBase,
                x: { type: 'number', required: true }, y: { type: 'number', required: true }, size: { type: 'number' },
            } },
        { type: 'object', additionalProperties: false, properties: {
                type: { type: 'string', enum: ['segment', 'arrow'], required: true }, ...sceneBase,
                x1: { type: 'number', required: true }, y1: { type: 'number', required: true },
                x2: { type: 'number', required: true }, y2: { type: 'number', required: true }, stroke,
            } },
        { type: 'object', additionalProperties: false, properties: {
                type: { type: 'string', const: 'circle', required: true }, ...sceneBase,
                cx: { type: 'number', required: true }, cy: { type: 'number', required: true }, r: { type: 'number', required: true },
            } },
        { type: 'object', additionalProperties: false, properties: {
                type: { type: 'string', const: 'rect', required: true }, ...sceneBase,
                x: { type: 'number', required: true }, y: { type: 'number', required: true },
                width: { type: 'number', required: true }, height: { type: 'number', required: true },
            } },
        { type: 'object', additionalProperties: false, properties: {
                type: { type: 'string', const: 'polygon', required: true }, ...sceneBase,
                points: { type: 'array', required: true, items: coordinate, description: '3 to 24 polygon vertices.' },
            } },
        { type: 'object', additionalProperties: false, properties: {
                type: { type: 'string', const: 'label', required: true }, ...sceneBase,
                x: { type: 'number', required: true }, y: { type: 'number', required: true }, text: { type: 'string', required: true },
            } },
    ] };
const sceneContent = { type: 'object', additionalProperties: false, properties: {
        kind: {
            type: 'string', const: 'scene_2d', required: true,
            description: 'Geometry, vectors, forces, spatial relationships, and annotated scientific schematics.',
        },
        xAxis: required(axis),
        yAxis: required(axis),
        grid: { type: 'boolean' },
        elements: { type: 'array', items: sceneElement, required: true, description: '1 to 64 scene elements.' },
    } };
const relationSubject = { type: 'object', additionalProperties: false, properties: {
        id: { ...identifier, required: true }, label: { type: 'string', required: true },
        detail: { type: 'string' }, tone,
    } };
const relationAxisItem = { type: 'object', additionalProperties: false, properties: {
        id: { ...identifier, required: true }, label: { type: 'string', required: true },
    } };
const comparisonContent = { type: 'object', additionalProperties: false, properties: {
        kind: { type: 'string', const: 'relation', required: true },
        variant: { type: 'string', const: 'comparison', required: true },
        subjects: { type: 'array', items: relationSubject, required: true, description: '2 to 4 subjects.' },
        rows: { type: 'array', required: true, items: {
                type: 'object', additionalProperties: false, properties: {
                    id: { ...identifier, required: true }, label: { type: 'string', required: true }, detail: { type: 'string' },
                    cells: { type: 'array', required: true, items: {
                            type: 'object', additionalProperties: false, properties: {
                                subjectId: { type: 'string', required: true }, value: { type: 'string', required: true }, tone,
                            },
                        }, description: '1 to 4 cells; each subjectId must reference a declared subject.' },
                },
            }, description: '1 to 16 comparison rows.' },
    } };
const matrixContent = { type: 'object', additionalProperties: false, properties: {
        kind: { type: 'string', const: 'relation', required: true },
        variant: { type: 'string', const: 'matrix', required: true },
        rows: { type: 'array', items: relationAxisItem, required: true, description: '1 to 10 matrix rows.' },
        columns: { type: 'array', items: relationAxisItem, required: true, description: '1 to 10 matrix columns.' },
        cells: { type: 'array', required: true, items: {
                type: 'object', additionalProperties: false, properties: {
                    id: { ...identifier, required: true }, rowId: { type: 'string', required: true },
                    columnId: { type: 'string', required: true }, label: { type: 'string', required: true },
                    detail: { type: 'string' }, tone,
                },
            }, description: '1 to 64 matrix cells; rowId and columnId must reference declared axes.' },
    } };
const setsContent = { type: 'object', additionalProperties: false, properties: {
        kind: { type: 'string', const: 'relation', required: true },
        variant: { type: 'string', const: 'sets', required: true },
        sets: { type: 'array', items: relationSubject, required: true, description: '2 to 3 sets.' },
        items: { type: 'array', required: true, items: {
                type: 'object', additionalProperties: false, properties: {
                    id: { ...identifier, required: true }, label: { type: 'string', required: true },
                    setIds: {
                        type: 'array', items: { type: 'string' }, required: true,
                        description: '1 to 3 unique ids referencing declared sets.',
                    }, detail: { type: 'string' },
                },
            }, description: '1 to 24 set items.' },
    } };
const relationContent = { oneOf: [comparisonContent, matrixContent, setsContent] };
const timelineEvent = { type: 'object', additionalProperties: false, properties: {
        id: { ...identifier, required: true },
        time: { type: 'string', required: true },
        label: { type: 'string', required: true },
        detail: { type: 'string' },
        position: { type: 'number', description: 'Optional normalized position from 0 to 1. Provide it for every event or omit it for every event.' },
        tone,
    } };
const timelineContent = { type: 'object', additionalProperties: false, properties: {
        kind: {
            type: 'string', const: 'timeline', required: true,
            description: 'Ordered historical events, scientific discoveries, biographies, eras, or other chronology where time order is the structure.',
        },
        orientation: { type: 'string', enum: ['horizontal', 'vertical'] },
        events: { type: 'array', items: timelineEvent, required: true, description: '2 to 32 events in chronological order.' },
        eras: { type: 'array', items: {
                type: 'object', additionalProperties: false, properties: {
                    id: { ...identifier, required: true }, label: { type: 'string', required: true },
                    startEventId: { type: 'string', required: true }, endEventId: { type: 'string', required: true },
                    detail: { type: 'string' }, tone,
                },
            }, description: 'Optional 1 to 8 eras; startEventId and endEventId must reference declared events in order.' },
    } };
const formulaStepsContent = { type: 'object', additionalProperties: false, properties: {
        kind: {
            type: 'string', const: 'formula_steps', required: true,
            description: 'A derivation, algebraic transformation, proof chain, or symbolic simplification where the rule between steps matters. Not for merely recalling one formula.',
        },
        notation: { type: 'string', description: 'Optional short notation key used across the derivation.' },
        steps: { type: 'array', required: true, items: {
                type: 'object', additionalProperties: false, properties: {
                    id: { ...identifier, required: true },
                    expression: {
                        type: 'string',
                        required: true,
                        description: 'One LaTeX display expression without dollar delimiters; use commands such as \\lim_{h \\to 0} and ^{\\prime}.',
                    },
                    label: { type: 'string' }, rule: { type: 'string' }, detail: { type: 'string' }, tone,
                },
            }, description: '2 to 16 formula steps.' },
        conclusion: { type: 'string' },
    } };
const studyMapContent = { type: 'object', additionalProperties: false, properties: {
        kind: {
            type: 'string', const: 'study_map', required: true,
            description: 'A navigable overview of a supplied document, chapter, slide deck, or multi-concept learning source. Preserve source sections and anchors instead of flattening the material.',
        },
        sourceLabel: { type: 'string', required: true },
        goal: { type: 'string' },
        sections: { type: 'array', required: true, items: {
                type: 'object', additionalProperties: false, properties: {
                    id: { ...identifier, required: true }, label: { type: 'string', required: true },
                    anchor: { type: 'string', description: 'Human-readable source location, such as Chapter 2 or pp. 18–23.' },
                    summary: { type: 'string' },
                },
            }, description: '1 to 16 source sections.' },
        concepts: { type: 'array', required: true, items: {
                type: 'object', additionalProperties: false, properties: {
                    id: { ...identifier, required: true }, label: { type: 'string', required: true },
                    sectionId: { type: 'string', required: true }, detail: { type: 'string' },
                    prerequisiteIds: {
                        type: 'array', items: { type: 'string' },
                        description: 'Optional; at most 8 unique declared concept ids, excluding this concept, with no cycles.',
                    },
                    role: { type: 'string', enum: ['foundation', 'core', 'extension', 'practice'] },
                    tone,
                },
            }, description: '1 to 48 concepts; every sectionId must reference a declared section.' },
    } };
const recallDeckContent = { type: 'object', additionalProperties: false, properties: {
        kind: {
            type: 'string', const: 'recall_deck', required: true,
            description: 'A requested flashcard or active-recall set with hidden answers, hints, and local review state. Use only after the relevant material is known.',
        },
        instructions: { type: 'string' },
        cards: { type: 'array', required: true, items: {
                type: 'object', additionalProperties: false, properties: {
                    id: { ...identifier, required: true }, prompt: { type: 'string', required: true },
                    answer: { type: 'string', required: true }, hint: { type: 'string' },
                    tags: { type: 'array', items: { type: 'string' }, description: 'Optional; at most 6 unique labels.' },
                },
            }, description: '2 to 32 recall cards.' },
    } };
const sequence = { type: 'object', additionalProperties: false, properties: {
        initialFrameId: { type: 'string' },
        frames: { type: 'array', required: true, items: {
                type: 'object', additionalProperties: false, properties: {
                    id: { ...identifier, required: true }, label: { type: 'string', required: true },
                    description: { type: 'string' },
                    focusIds: {
                        type: 'array', items: { type: 'string' }, required: true,
                        description: 'At most 64 unique ids already declared by content.',
                    },
                },
            }, description: '2 to 12 sequence frames.' },
    } };
export function apply(ctx) {
    const services = ctx;
    services.tools.register(closeParameterRoot(defineTool({
        name: 'learning_visual',
        description: [
            'Render one trusted, native, non-blocking semantic visual inline in the current teaching response.',
            'Choose the content kind by the concept itself: plot for quantitative axes; node_link for topology; scene_2d for space; relation for comparisons; timeline for chronology; formula_steps for derivations; study_map for supplied multi-section material; recall_deck for requested active recall.',
            'Do not call this tool merely because Learning mode is active. A request to recall a formula, definition, or short fact normally needs direct prose, not a chart.',
            'Never substitute a plot for a requested structure diagram. A fully connected neural layer is node_link with layered groups and all connections, not a sigmoid curve.',
            'The call completes immediately: after it returns, continue naturally with the interpretation and at most one ordinary conversational question.',
            'Optional sequence frames highlight ids already declared by the chosen content; they create local step-through exploration without taking over learner input.',
            'Plot curves use a closed recursive math AST. Metrics must depend only on declared parameters.',
            'Hard limits: the complete call must stay within 64 KiB; every id is 1 to 32 lowercase-safe characters; keep labels to 120 characters, ordinary detail text to 1000, LaTeX expressions to 500, recall prompts to 1000 and answers to 2000. Array limits are stated on each field and are mandatory.',
        ].join(' '),
        parameters: {
            protocol: { type: 'string', const: VISUAL_PROTOCOL_V4, required: true },
            title: { type: 'string', description: 'Concise visible and accessible visual title.', required: true },
            description: { type: 'string', description: 'Optional one-sentence exploration hint; do not repeat surrounding prose.' },
            content: {
                oneOf: [
                    plotContent,
                    nodeLinkContent,
                    sceneContent,
                    relationContent,
                    timelineContent,
                    formulaStepsContent,
                    studyMapContent,
                    recallDeckContent,
                ],
                required: true,
                description: 'Exactly one closed native visual content object. Never provide HTML, Markdown diagrams, SVG markup, or JavaScript.',
            },
            sequence,
            fallbackMarkdown: {
                type: 'string',
                description: 'Optional concise text equivalent for accessibility or an unavailable renderer; do not use it instead of valid content.',
            },
        },
        output: {
            schema: { type: 'object', additionalProperties: false, properties: {
                    protocol: { type: 'string', const: VISUAL_RESULT_PROTOCOL_V4, required: true },
                    status: { type: 'string', const: 'ready', required: true },
                } },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
        },
        isConcurrencySafe: () => true,
        async execute(args) {
            parseLearningVisualV4(args);
            return {
                protocol: VISUAL_RESULT_PROTOCOL_V4,
                status: 'ready',
            };
        },
        presentCall: args => ({
            card: 'generic',
            title: typeof args.title === 'string' ? args.title : 'Interactive visual',
            kind: 'read',
        }),
    })));
    services.systemPrompt.section({
        name: 'learning:policy',
        order: 20,
        text: [
            'The user selected Learning mode. Teach as a thoughtful conversation in the learner\'s language and register. When the goal is already clear, begin with the missing idea instead of opening with a questionnaire. Use a compact explanation, analogy, worked example, prediction, or reflection according to the actual gap, and stop when the learner demonstrates transfer.',
            'Keep learner input in the ordinary conversation. Ask at most one focused question at a time, let the normal message composer collect the answer, and continue from the learner\'s actual words. Do not turn a lesson into a sequence of submit buttons, reveal gates, duplicated cards, or fixed rounds.',
            'Use learning_visual at most once in a response, and only when a diagram or local manipulation materially improves understanding. Match the representation to the concept: plot for quantitative relationships; node_link for topology, causes, dependencies, or processes; scene_2d for geometry and spatial mechanisms; relation for comparison, matrix, classification, or sets; timeline for chronology; formula_steps for a derivation whose transformations matter; study_map for a supplied multi-section source; recall_deck when the learner asks for flashcards or active recall. Use sequence frames only when progressive focus helps. Make the surrounding prose self-sufficient, let the visual complete immediately, then continue in the same response with the key interpretation and, if useful, one natural question. Never ask the learner to submit visual state through a custom form.',
            'Do not force a visual for a formula, definition, fact, or already-clear explanation. If the learner asks for a derivative formula, give the formula directly; use a plot or scene only if they ask why it works or need the secant-to-tangent geometry. If the learner asks for a fully connected neuron or layer, use node_link with layered groups and explicit edges; never replace structural topology with an activation-function plot or ASCII/Markdown art.',
            'When the learner supplies a reference file, inspect its actual organization and their goal before choosing a visual. Use study_map for a source-level overview with stable section or page anchors, then teach one concept at a time with the most specific visual kind. Do not compress an entire document into one giant graph, invent unseen sections, or turn every attachment into flashcards. Use recall_deck only when requested or when an agreed review phase begins.',
            'Use ask_user_question only for a user-owned choice about direction, depth, or pace that materially changes the lesson. Ask exactly one single-select question with two or three broad mutually exclusive options; otherwise infer a reasonable default and continue.',
            'Load the interactive-teaching skill when a multi-turn lesson needs teaching judgment beyond these standing rules.',
        ].join('\n\n'),
    });
}
//# sourceMappingURL=agent.js.map