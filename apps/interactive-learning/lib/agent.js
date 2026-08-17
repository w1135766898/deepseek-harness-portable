import { c as RESPONSE_PROTOCOL, t as ACTIVITY_PROTOCOL, u as parseLearningActivity } from "./protocol-D2kY57TF.js";
import { defineTool } from "@deepseek-ai/dsh-tools";
//#region lib/types/agent.js
const name = "interactive-learning-agent";
const inject = [
	"tools",
	"systemPrompt",
	"learningActivities"
];
const description = [
	"Present one focused, interactive teaching activity and wait for the learner response.",
	"Use parameter_explorer for bounded quantitative relationships, process_stepper for predict-then-reveal sequences,",
	"or structure_compare for aligned structural differences. Do not use it for facts or notation that one short explanation resolves,",
	"or for user-owned choices such as learning direction, depth, or pace; use ask_user_question for those choices."
].join(" ");
function apply(ctx) {
	const services = ctx;
	services.tools.register(defineTool({
		name: "learning_activity",
		description,
		parameters: {
			protocol: {
				type: "string",
				const: ACTIVITY_PROTOCOL,
				required: true,
				description: `Protocol literal ${ACTIVITY_PROTOCOL}.`
			},
			kind: {
				type: "string",
				enum: [
					"parameter_explorer",
					"process_stepper",
					"structure_compare"
				],
				required: true,
				description: "The single renderer whose interaction best exposes the target relationship."
			},
			title: {
				type: "string",
				required: true,
				description: "Short learner-facing activity title."
			},
			objective: {
				type: "string",
				required: true,
				description: "The one understanding this activity should establish."
			},
			prompt: {
				type: "string",
				required: true,
				description: "The focused question the learner should answer through the activity."
			},
			scaffold: {
				type: "string",
				description: "Optional minimal hint; do not reveal the full answer."
			},
			payload: {
				type: "object",
				additionalProperties: true,
				required: true,
				description: [
					"Renderer payload. parameter_explorer: {parameters:[{id,label,min,max,step,initial}],xAxis:{label?,min,max,samples?},curves:[{id,label,expression}],question?};",
					"process_stepper: {steps:[{id,title,content,checkpoint?:{question,options?}}],question?};",
					"structure_compare: {left:{title,items:[{id,label,detail?}]},right:{...},alignments:[{id,leftId?,rightId?,prompt?}],question?}.",
					"Expressions are closed AST nodes: constant/value, variable/name, binary add|sub|mul|div|pow with left/right, or unary neg|abs|sqrt|sin|cos|exp|log with value."
				].join(" ")
			},
			fallbackMarkdown: {
				type: "string",
				required: true,
				description: "A complete non-interactive teaching fallback that still asks for a learner response."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					protocol: {
						type: "string",
						const: RESPONSE_PROTOCOL,
						required: true
					},
					activityId: {
						type: "string",
						required: true
					},
					action: {
						type: "string",
						enum: [
							"submit",
							"skip",
							"cancel"
						],
						required: true
					},
					answer: { type: "json" },
					interactionState: { type: "json" }
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value)
			}]
		},
		isConcurrencySafe: () => false,
		async execute(args, exec) {
			const activity = parseLearningActivity(args);
			return services.learningActivities.present({
				activity,
				...exec.agent === void 0 ? {} : { agent: exec.agent },
				signal: exec.signal
			});
		},
		presentCall(args) {
			return {
				card: "generic",
				title: args.title,
				kind: "read"
			};
		}
	}));
	services.systemPrompt.section({
		name: "learning:policy",
		order: 20,
		text: [
			"The user selected Learning mode. Treat requests to teach, explain, practise, derive, or understand as learning requests even when the subject is coding, writing, or calculation. Distinguish “teach me to do this” from “do this for me”; if they only want task completion, answer briefly and mention Standard or Code mode without turning it into a refusal.",
			"Sound like a natural conversation in the user’s language and register. Do not announce a lesson plan, diagnosis, learning objective, teaching technique, or mode transition. Avoid canned praise and translation-like headings. If the request is already clear, give a useful foothold immediately; ask one short diagnostic question only when its answer would materially change what you explain next.",
			"Treat learning direction, depth, and pace as user-owned choices. When one of those choices materially changes the next explanation, use ask_user_question with one native single-select question, two or three brief mutually exclusive options, and multi_select false. Never encode these preferences as learning_activity. When a reasonable default is available, infer it and continue instead of asking merely to display a control.",
			"Choose the least elaborate useful move: a direct explanation, one guiding question, a neighboring worked example, one interactive activity, or a brief check for transfer. A question is optional, not a turn template. Never withhold a needed explanation merely to remain Socratic.",
			"Adapt to the learner’s response. Refer to the specific evidence in their answer, repair only the remaining misconception, and ask for transfer only when useful. If they ask to speed up or switch to direct explanation, do so immediately. End the teaching segment explicitly once they can explain or apply the idea; do not continue questioning mechanically.",
			"Load the interactive-teaching skill when the request needs a multi-turn lesson, when choosing among teaching moves is non-obvious, or when you need detailed activity payload contracts and the evaluation rubric."
		].join("\n\n")
	});
	services.systemPrompt.section({
		name: "tool:learning_choice",
		order: 140,
		text: [
			"In Learning mode, use ask_user_question only for a learner-owned choice that materially changes the next explanation, such as direction, depth, or pace.",
			"Ask exactly one question with exactly two or three broad, mutually exclusive options and multi_select false. Combine fine-grained topics into broader choices and defer further narrowing to the conversation; never present a long catalogue.",
			"Let the native question UI carry the options. Do not reproduce them as learning_activity, checkboxes, a custom card, or a second prose list. If a sensible default exists, continue without calling the tool."
		].join(" ")
	});
	services.systemPrompt.section({
		name: "tool:learning_activity",
		order: 150,
		text: [
			"Use learning_activity only when manipulating a parameter, revealing a process state-by-state, or aligning structural differences materially improves understanding.",
			"Keep one activity to one teaching goal. Introduce it with one ordinary conversational sentence in the same assistant turn, then let its light inline placeholder and activity carry the interaction; do not announce a tool or repeat its title, objective, and prompt in prose. Ask for a prediction or decision before revealing the key relationship, then wait for the tool result.",
			"Continue in that conversation from the compact returned result: address the learner’s actual parameter choice, prediction, selection, or explanation instead of repeating the preceding explanation.",
			"If the action is skip or cancel, or the rich client is unavailable, parsing fails, or the interaction times out, use fallbackMarkdown as the concise text-equivalent lesson and continue. Never generate HTML, JavaScript, React, network code, or executable widget content."
		].join(" ")
	});
}
//#endregion
export { apply, inject, name };
