import { n as LEARNING_INTENT_POLICY, t as routeLearningRequest } from "./teaching-route-CSoe_oAq.js";
import { E as VISUAL_RESULT_PROTOCOL_V4, L as parseLearningVisualV4, c as LEARNING_CHECKPOINT_KINDS, d as LearningProtocolError, f as MATH_BINARY_OPERATORS, i as CHECKPOINT_RESULT_PROTOCOL, j as parseLearningCheckpointV1, p as MATH_UNARY_OPERATORS, r as CHECKPOINT_PROTOCOL, s as LEARNING_CHECKPOINT_EVIDENCE_KINDS, u as LEARNING_VISUAL_STATUSES, w as VISUAL_PROTOCOL_V4 } from "./protocol-D-KGSMae.js";
import { defineTool } from "@deepseek-ai/dsh-tools";
//#region lib/types/teaching-policy.js
/**
* Compact standing policy for the Learning preset.
*
* Detailed intent, diagnosis, move, integrity, visual, and source-material
* construction rules live in the progressive-disclosure Skill. Keep this
* string short: it is injected into every Learning request and must leave
* room for the learner's actual words.
*/
const LEARNING_TEACHING_POLICY = [
	"# DeepSeek Harness Learning Policy",
	"Optimize for durable capability: the learner should eventually explain, predict, distinguish, debug, or apply the idea without help. Be warm, direct, and concise; match the learner's language and requested depth. Do not prolong lessons, withhold useful answers, or use tools for their own sake.",
	"## Learn intent",
	LEARNING_INTENT_POLICY,
	"## Route first",
	"Treat a short “learn X”, “teach me X”, or “understand X” request with unknown level and goal as calibration, not as permission to dump a full overview: ask one question whose answer changes the teaching route (for example, whether they want an intuitive introduction, hands-on use, or theory). If the learner says “from zero”, “beginner”, or “concept intro”, teach one minimum concept immediately and do not ask background questions again. Give a structured overview directly only when the learner asks for a complete/full overview, says to answer without questions, or asks for a current or contested-topic survey. A concrete urgent blocker is direct help first. Otherwise, when the goal or exact confusion is clear, start teaching it; do not open with a questionnaire.",
	"## One-step teaching loop",
	"Each response makes one cognitive move: a minimum explanation plus one concrete example, contrast, or parallel step. Ask at most one focused learner question, and only with a scaffold that makes productive reasoning possible. Never send an empty “what do you think?” prompt or hide a second question in a visual.",
	"Use observable evidence only. Name what the learner actually said or did. For a correct response, preserve the correct part and raise difficulty slightly; for a partial or wrong response, isolate the precise error, add new information, and offer a nearby retry. A concept gap needs the concept; a procedure gap needs a distinct parallel example; a notation gap needs symbols decoded; a prerequisite gap needs the missing rule first.",
	"Never repeat a hint, analogy, question, or explanation fingerprint. When the learner says “I don’t understand”, shrink the concept or change representation and add new information; do not paraphrase the same move. “I heard it” is not mastery: require an explanation, prediction, or application in a fresh situation.",
	"Stop after independent fresh transfer. State the concrete evidence and offer, but do not force, a next step. Do not manufacture another question, checkpoint, praise loop, or plan step after transfer. A plan is tentative and never a completion checklist.",
	"Ordinary conversation is the default. Use a visual only when one relationship is materially clearer by seeing or manipulating it; use a checkpoint only when the learner's response will change the next move. Both are optional and non-blocking on the ordinary text path. In the move ontology the checkpoint is a reflective pause: the wire-compatible `learning_checkpoint` tool is the sole deliberate user wait, and skip/cancel/failure must return to ordinary conversation without withholding teaching. Load the interactive-teaching Skill only for detailed visual or supplied-source construction.",
	"Keep academic-integrity limits for observable assessed work only. Never invent facts, citations, source anchors, learner evidence, or confidence; correct mistakes plainly.",
	"The `learning_state_update` state is tentative and session-local. Update it only after a substantive observable change. Use phase, last explanation/question, learner-response assessment, current misconception, next move, and move fingerprint to choose a different next move; do not narrate these fields to the learner."
].join("\n\n");
//#endregion
//#region lib/types/agent.js
const name = "interactive-learning-agent";
const inject = [
	"tools",
	"systemPrompt",
	"learningActivities"
];
function closeParameterRoot(tool) {
	return {
		...tool,
		parameters: {
			...tool.parameters,
			additionalProperties: false
		}
	};
}
const parameter = {
	type: "object",
	additionalProperties: false,
	properties: {
		id: {
			type: "string",
			description: "Identifier: 1 to 32 characters, start with a lowercase letter, then use only a-z, 0-9, _ or -. The id x is reserved for the chart axis.",
			required: true
		},
		label: {
			type: "string",
			required: true
		},
		min: {
			type: "number",
			required: true
		},
		max: {
			type: "number",
			required: true
		},
		step: {
			type: "number",
			required: true
		},
		initial: {
			type: "number",
			required: true
		}
	}
};
function mathExpressionSchema(depth) {
	const leaves = [{
		type: "object",
		additionalProperties: false,
		properties: {
			op: {
				type: "string",
				const: "constant",
				required: true
			},
			value: {
				type: "number",
				required: true
			}
		}
	}, {
		type: "object",
		additionalProperties: false,
		properties: {
			op: {
				type: "string",
				const: "variable",
				required: true
			},
			name: {
				type: "string",
				description: "Use x or one of this visual's parameter ids.",
				required: true
			}
		}
	}];
	if (depth <= 1) return { oneOf: leaves };
	const nested = mathExpressionSchema(depth - 1);
	return { oneOf: [
		...leaves,
		{
			type: "object",
			additionalProperties: false,
			properties: {
				op: {
					type: "string",
					enum: MATH_UNARY_OPERATORS,
					required: true
				},
				value: {
					...nested,
					required: true
				}
			}
		},
		{
			type: "object",
			additionalProperties: false,
			properties: {
				op: {
					type: "string",
					enum: MATH_BINARY_OPERATORS,
					required: true
				},
				left: {
					...nested,
					required: true
				},
				right: {
					...nested,
					required: true
				}
			}
		}
	] };
}
function required(schema) {
	return {
		...schema,
		required: true
	};
}
const requiredExpression = required(mathExpressionSchema(4));
const identifier = {
	type: "string",
	description: "Identifier: 1 to 32 characters, start with a lowercase letter, then use only a-z, 0-9, _ or -."
};
const tone = {
	type: "string",
	enum: [
		"blue",
		"green",
		"red",
		"orange",
		"purple",
		"gray"
	]
};
const stroke = {
	type: "string",
	enum: [
		"solid",
		"dashed",
		"dotted"
	]
};
const point = {
	type: "object",
	additionalProperties: false,
	properties: {
		x: {
			type: "number",
			required: true
		},
		y: {
			type: "number",
			required: true
		},
		label: { type: "string" }
	}
};
const coordinate = {
	type: "object",
	additionalProperties: false,
	properties: {
		x: {
			type: "number",
			required: true
		},
		y: {
			type: "number",
			required: true
		}
	}
};
const axis = {
	type: "object",
	additionalProperties: false,
	properties: {
		label: { type: "string" },
		min: {
			type: "number",
			required: true
		},
		max: {
			type: "number",
			required: true
		}
	}
};
const curveSeries = {
	type: "object",
	additionalProperties: false,
	properties: {
		type: {
			type: "string",
			const: "curve",
			required: true
		},
		id: {
			...identifier,
			required: true
		},
		label: {
			type: "string",
			required: true
		},
		expression: requiredExpression,
		tone,
		stroke
	}
};
const pointSeries = {
	type: "object",
	additionalProperties: false,
	properties: {
		type: {
			type: "string",
			const: "points",
			required: true
		},
		id: {
			...identifier,
			required: true
		},
		label: {
			type: "string",
			required: true
		},
		points: {
			type: "array",
			required: true,
			items: point,
			description: "1 to 256 points."
		},
		tone
	}
};
const lineSeries = {
	type: "object",
	additionalProperties: false,
	properties: {
		type: {
			type: "string",
			const: "line",
			required: true
		},
		id: {
			...identifier,
			required: true
		},
		label: {
			type: "string",
			required: true
		},
		points: {
			type: "array",
			required: true,
			items: point,
			description: "1 to 256 points."
		},
		tone,
		stroke
	}
};
const barSeries = {
	type: "object",
	additionalProperties: false,
	properties: {
		type: {
			type: "string",
			const: "bars",
			required: true
		},
		id: {
			...identifier,
			required: true
		},
		label: {
			type: "string",
			required: true
		},
		points: {
			type: "array",
			required: true,
			items: point,
			description: "1 to 64 bars."
		},
		tone
	}
};
const plotContent = {
	type: "object",
	additionalProperties: false,
	properties: {
		kind: {
			type: "string",
			const: "plot",
			required: true,
			description: "Functions, quantitative data, probability, distributions, or tangent/secant geometry on Cartesian axes."
		},
		parameters: {
			type: "array",
			items: parameter,
			description: "Optional; omit for a static plot. Use at most three only when changing the value teaches the mechanism."
		},
		xAxis: {
			...axis,
			required: true,
			properties: {
				...axis.properties,
				samples: {
					type: "integer",
					description: "Optional curve samples from 24 to 256."
				}
			}
		},
		yAxis: required(axis),
		series: {
			type: "array",
			required: true,
			items: { oneOf: [
				curveSeries,
				pointSeries,
				lineSeries,
				barSeries
			] },
			description: "1 to 8 series."
		},
		metrics: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				properties: {
					id: {
						...identifier,
						required: true
					},
					label: {
						type: "string",
						required: true
					},
					expression: requiredExpression,
					digits: { type: "integer" },
					suffix: { type: "string" }
				}
			},
			description: "Optional; at most 4 metrics."
		}
	}
};
const nodeGroup = {
	type: "object",
	additionalProperties: false,
	properties: {
		id: {
			...identifier,
			required: true
		},
		label: {
			type: "string",
			required: true
		}
	}
};
const node = {
	type: "object",
	additionalProperties: false,
	properties: {
		id: {
			...identifier,
			required: true
		},
		label: {
			type: "string",
			required: true
		},
		detail: { type: "string" },
		group: { type: "string" },
		tone
	}
};
const edge = {
	type: "object",
	additionalProperties: false,
	properties: {
		id: {
			...identifier,
			required: true
		},
		from: {
			type: "string",
			required: true
		},
		to: {
			type: "string",
			required: true
		},
		label: { type: "string" },
		detail: { type: "string" },
		tone,
		stroke,
		directed: { type: "boolean" }
	}
};
const nodeLinkContent = {
	type: "object",
	additionalProperties: false,
	properties: {
		kind: {
			type: "string",
			const: "node_link",
			required: true,
			description: "Networks, fully connected layers, trees, causality, concept maps, state transitions, and dependency topology."
		},
		layout: {
			type: "string",
			enum: [
				"layered",
				"hierarchy",
				"radial"
			],
			required: true
		},
		groups: {
			type: "array",
			items: nodeGroup,
			description: "Optional 1 to 12 ordered layers for layered layout; every node must reference one group."
		},
		nodes: {
			type: "array",
			items: node,
			required: true,
			description: "2 to 48 nodes."
		},
		edges: {
			type: "array",
			items: edge,
			required: true,
			description: "1 to 160 edges; include every semantically required connection."
		}
	}
};
const sceneBase = {
	id: {
		...identifier,
		required: true
	},
	label: { type: "string" },
	detail: { type: "string" },
	tone
};
const sceneElement = { oneOf: [
	{
		type: "object",
		additionalProperties: false,
		properties: {
			type: {
				type: "string",
				const: "point",
				required: true
			},
			...sceneBase,
			x: {
				type: "number",
				required: true
			},
			y: {
				type: "number",
				required: true
			},
			size: { type: "number" }
		}
	},
	{
		type: "object",
		additionalProperties: false,
		properties: {
			type: {
				type: "string",
				enum: ["segment", "arrow"],
				required: true
			},
			...sceneBase,
			x1: {
				type: "number",
				required: true
			},
			y1: {
				type: "number",
				required: true
			},
			x2: {
				type: "number",
				required: true
			},
			y2: {
				type: "number",
				required: true
			},
			stroke
		}
	},
	{
		type: "object",
		additionalProperties: false,
		properties: {
			type: {
				type: "string",
				const: "circle",
				required: true
			},
			...sceneBase,
			cx: {
				type: "number",
				required: true
			},
			cy: {
				type: "number",
				required: true
			},
			r: {
				type: "number",
				required: true
			}
		}
	},
	{
		type: "object",
		additionalProperties: false,
		properties: {
			type: {
				type: "string",
				const: "rect",
				required: true
			},
			...sceneBase,
			x: {
				type: "number",
				required: true
			},
			y: {
				type: "number",
				required: true
			},
			width: {
				type: "number",
				required: true
			},
			height: {
				type: "number",
				required: true
			}
		}
	},
	{
		type: "object",
		additionalProperties: false,
		properties: {
			type: {
				type: "string",
				const: "polygon",
				required: true
			},
			...sceneBase,
			points: {
				type: "array",
				required: true,
				items: coordinate,
				description: "3 to 24 polygon vertices."
			}
		}
	},
	{
		type: "object",
		additionalProperties: false,
		properties: {
			type: {
				type: "string",
				const: "label",
				required: true
			},
			...sceneBase,
			x: {
				type: "number",
				required: true
			},
			y: {
				type: "number",
				required: true
			},
			text: {
				type: "string",
				required: true
			}
		}
	}
] };
const sceneContent = {
	type: "object",
	additionalProperties: false,
	properties: {
		kind: {
			type: "string",
			const: "scene_2d",
			required: true,
			description: "Geometry, vectors, forces, spatial relationships, and annotated scientific schematics."
		},
		xAxis: required(axis),
		yAxis: required(axis),
		grid: { type: "boolean" },
		elements: {
			type: "array",
			items: sceneElement,
			required: true,
			description: "1 to 64 scene elements."
		}
	}
};
const relationSubject = {
	type: "object",
	additionalProperties: false,
	properties: {
		id: {
			...identifier,
			required: true
		},
		label: {
			type: "string",
			required: true
		},
		detail: { type: "string" },
		tone
	}
};
const relationAxisItem = {
	type: "object",
	additionalProperties: false,
	properties: {
		id: {
			...identifier,
			required: true
		},
		label: {
			type: "string",
			required: true
		}
	}
};
const relationContent = { oneOf: [
	{
		type: "object",
		additionalProperties: false,
		properties: {
			kind: {
				type: "string",
				const: "relation",
				required: true
			},
			variant: {
				type: "string",
				const: "comparison",
				required: true
			},
			subjects: {
				type: "array",
				items: relationSubject,
				required: true,
				description: "2 to 4 subjects."
			},
			rows: {
				type: "array",
				required: true,
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						id: {
							...identifier,
							required: true
						},
						label: {
							type: "string",
							required: true
						},
						detail: { type: "string" },
						cells: {
							type: "array",
							required: true,
							items: {
								type: "object",
								additionalProperties: false,
								properties: {
									subjectId: {
										type: "string",
										required: true
									},
									value: {
										type: "string",
										required: true
									},
									tone
								}
							},
							description: "1 to 4 cells; each subjectId must reference a declared subject."
						}
					}
				},
				description: "1 to 16 comparison rows."
			}
		}
	},
	{
		type: "object",
		additionalProperties: false,
		properties: {
			kind: {
				type: "string",
				const: "relation",
				required: true
			},
			variant: {
				type: "string",
				const: "matrix",
				required: true
			},
			rows: {
				type: "array",
				items: relationAxisItem,
				required: true,
				description: "1 to 10 matrix rows."
			},
			columns: {
				type: "array",
				items: relationAxisItem,
				required: true,
				description: "1 to 10 matrix columns."
			},
			cells: {
				type: "array",
				required: true,
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						id: {
							...identifier,
							required: true
						},
						rowId: {
							type: "string",
							required: true
						},
						columnId: {
							type: "string",
							required: true
						},
						label: {
							type: "string",
							required: true
						},
						detail: { type: "string" },
						tone
					}
				},
				description: "1 to 64 matrix cells; rowId and columnId must reference declared axes."
			}
		}
	},
	{
		type: "object",
		additionalProperties: false,
		properties: {
			kind: {
				type: "string",
				const: "relation",
				required: true
			},
			variant: {
				type: "string",
				const: "sets",
				required: true
			},
			sets: {
				type: "array",
				items: relationSubject,
				required: true,
				description: "2 to 3 sets."
			},
			items: {
				type: "array",
				required: true,
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						id: {
							...identifier,
							required: true
						},
						label: {
							type: "string",
							required: true
						},
						setIds: {
							type: "array",
							items: { type: "string" },
							required: true,
							description: "1 to 3 unique ids referencing declared sets."
						},
						detail: { type: "string" }
					}
				},
				description: "1 to 24 set items."
			}
		}
	}
] };
const timelineContent = {
	type: "object",
	additionalProperties: false,
	properties: {
		kind: {
			type: "string",
			const: "timeline",
			required: true,
			description: "Ordered historical events, scientific discoveries, biographies, eras, or other chronology where time order is the structure."
		},
		orientation: {
			type: "string",
			enum: ["horizontal", "vertical"]
		},
		events: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				properties: {
					id: {
						...identifier,
						required: true
					},
					time: {
						type: "string",
						required: true
					},
					label: {
						type: "string",
						required: true
					},
					detail: { type: "string" },
					position: {
						type: "number",
						description: "Optional normalized position from 0 to 1. Provide it for every event or omit it for every event."
					},
					tone
				}
			},
			required: true,
			description: "2 to 32 events in chronological order."
		},
		eras: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				properties: {
					id: {
						...identifier,
						required: true
					},
					label: {
						type: "string",
						required: true
					},
					startEventId: {
						type: "string",
						required: true
					},
					endEventId: {
						type: "string",
						required: true
					},
					detail: { type: "string" },
					tone
				}
			},
			description: "Optional 1 to 8 eras; startEventId and endEventId must reference declared events in order."
		}
	}
};
const formulaStepsContent = {
	type: "object",
	additionalProperties: false,
	properties: {
		kind: {
			type: "string",
			const: "formula_steps",
			required: true,
			description: "A derivation, algebraic transformation, proof chain, or symbolic simplification where the rule between steps matters. Not for merely recalling one formula."
		},
		notation: {
			type: "string",
			description: "Optional short notation key used across the derivation."
		},
		steps: {
			type: "array",
			required: true,
			items: {
				type: "object",
				additionalProperties: false,
				properties: {
					id: {
						...identifier,
						required: true
					},
					expression: {
						type: "string",
						required: true,
						description: "One LaTeX display expression without dollar delimiters; use commands such as \\lim_{h \\to 0} and ^{\\prime}."
					},
					label: { type: "string" },
					rule: { type: "string" },
					detail: { type: "string" },
					tone
				}
			},
			description: "2 to 16 formula steps."
		},
		conclusion: { type: "string" }
	}
};
const studyMapContent = {
	type: "object",
	additionalProperties: false,
	properties: {
		kind: {
			type: "string",
			const: "study_map",
			required: true,
			description: "A navigable overview of a supplied document, chapter, slide deck, or multi-concept learning source. Preserve source sections and anchors instead of flattening the material."
		},
		sourceLabel: {
			type: "string",
			required: true
		},
		goal: { type: "string" },
		sections: {
			type: "array",
			required: true,
			items: {
				type: "object",
				additionalProperties: false,
				properties: {
					id: {
						...identifier,
						required: true
					},
					label: {
						type: "string",
						required: true
					},
					anchor: {
						type: "string",
						description: "Human-readable source location, such as Chapter 2 or pp. 18–23."
					},
					summary: { type: "string" }
				}
			},
			description: "1 to 16 source sections."
		},
		concepts: {
			type: "array",
			required: true,
			items: {
				type: "object",
				additionalProperties: false,
				properties: {
					id: {
						...identifier,
						required: true
					},
					label: {
						type: "string",
						required: true
					},
					sectionId: {
						type: "string",
						required: true
					},
					detail: { type: "string" },
					prerequisiteIds: {
						type: "array",
						items: { type: "string" },
						description: "Optional; at most 8 unique declared concept ids, excluding this concept, with no cycles."
					},
					role: {
						type: "string",
						enum: [
							"foundation",
							"core",
							"extension",
							"practice"
						]
					},
					tone
				}
			},
			description: "1 to 48 concepts; every sectionId must reference a declared section."
		}
	}
};
const recallDeckContent = {
	type: "object",
	additionalProperties: false,
	properties: {
		kind: {
			type: "string",
			const: "recall_deck",
			required: true,
			description: "A requested flashcard or active-recall set with hidden answers, hints, and local review state. Use only after the relevant material is known."
		},
		instructions: { type: "string" },
		cards: {
			type: "array",
			required: true,
			items: {
				type: "object",
				additionalProperties: false,
				properties: {
					id: {
						...identifier,
						required: true
					},
					prompt: {
						type: "string",
						required: true
					},
					answer: {
						type: "string",
						required: true
					},
					hint: { type: "string" },
					tags: {
						type: "array",
						items: { type: "string" },
						description: "Optional; at most 6 unique labels."
					}
				}
			},
			description: "2 to 32 recall cards."
		}
	}
};
const sequence = {
	type: "object",
	additionalProperties: false,
	properties: {
		initialFrameId: { type: "string" },
		frames: {
			type: "array",
			required: true,
			items: {
				type: "object",
				additionalProperties: false,
				properties: {
					id: {
						...identifier,
						required: true
					},
					label: {
						type: "string",
						required: true
					},
					description: { type: "string" },
					focusIds: {
						type: "array",
						items: { type: "string" },
						required: true,
						description: "At most 64 unique ids already declared by content."
					}
				}
			},
			description: "2 to 12 sequence frames."
		}
	}
};
const checkpointOption = {
	type: "object",
	additionalProperties: false,
	properties: {
		id: {
			...identifier,
			required: true
		},
		label: {
			type: "string",
			required: true
		}
	}
};
const checkpointResponse = { oneOf: [
	{
		type: "object",
		additionalProperties: false,
		properties: { text: {
			type: "string",
			required: true
		} }
	},
	{
		type: "object",
		additionalProperties: false,
		properties: { optionId: {
			...identifier,
			required: true
		} }
	},
	{
		type: "object",
		additionalProperties: false,
		properties: { number: {
			type: "number",
			required: true
		} }
	}
] };
const checkpointOutput = { oneOf: [{
	type: "object",
	additionalProperties: false,
	properties: {
		protocol: {
			type: "string",
			const: CHECKPOINT_RESULT_PROTOCOL,
			required: true
		},
		checkpointId: {
			type: "string",
			required: true
		},
		status: {
			type: "string",
			const: "submitted",
			required: true
		},
		response: {
			...checkpointResponse,
			required: true
		},
		receiptId: {
			type: "string",
			required: true
		}
	}
}, {
	type: "object",
	additionalProperties: false,
	properties: {
		protocol: {
			type: "string",
			const: CHECKPOINT_RESULT_PROTOCOL,
			required: true
		},
		checkpointId: {
			type: "string",
			required: true
		},
		status: {
			type: "string",
			enum: ["skipped", "cancelled"],
			required: true
		},
		receiptId: {
			type: "string",
			required: true
		}
	}
}] };
const userCorrectionObservation = {
	type: "object",
	additionalProperties: false,
	properties: {
		id: {
			type: "string",
			required: true
		},
		source: {
			type: "string",
			const: "user-correction",
			required: true
		},
		summary: {
			type: "string",
			required: true
		},
		turn: { type: "integer" }
	}
};
const learnerEvidenceFields = {
	summary: {
		type: "string",
		required: true
	},
	confidence: {
		type: "string",
		enum: [
			"low",
			"medium",
			"high"
		]
	},
	correctness: {
		type: "string",
		enum: [
			"correct",
			"partial",
			"incorrect",
			"unknown"
		]
	},
	independence: {
		type: "string",
		enum: [
			"independent",
			"guided",
			"unknown"
		]
	}
};
const failedMove = {
	type: "object",
	additionalProperties: false,
	properties: {
		move: {
			type: "string",
			enum: [
				"none",
				"explanation",
				"example",
				"question",
				"guided_discovery",
				"worked_example",
				"reflective_pause",
				"resource",
				"repair",
				"transfer",
				"visual",
				"checkpoint"
			],
			required: true
		},
		fingerprint: {
			type: "string",
			required: true
		},
		failureReason: {
			type: "string",
			enum: [
				"not-understood",
				"repeated-misconception",
				"unhelpful-hint",
				"wrong-representation",
				"no-progress",
				"unavailable",
				"unknown"
			],
			required: true
		},
		representation: { type: "string" },
		summary: {
			type: "string",
			required: true
		},
		turn: { type: "integer" }
	}
};
const learnerEvidenceInput = { oneOf: [{
	type: "object",
	additionalProperties: false,
	properties: {
		kind: {
			type: "string",
			enum: [
				"attempt",
				"prediction",
				"explanation",
				"contrast",
				"error"
			],
			required: true
		},
		...learnerEvidenceFields
	}
}, {
	type: "object",
	additionalProperties: false,
	properties: {
		kind: {
			type: "string",
			const: "transfer",
			required: true
		},
		transferContext: {
			type: "string",
			enum: [
				"same",
				"fresh",
				"unknown"
			],
			required: true
		},
		...learnerEvidenceFields
	}
}] };
const learnerStateEvent = {
	type: "object",
	additionalProperties: false,
	properties: {
		type: {
			type: "string",
			enum: [
				"goal_observed",
				"request_kind_observed",
				"prior_knowledge_observed",
				"plan_observed",
				"plan_step_evidenced",
				"gap_observed",
				"readiness_observed",
				"progress_observed",
				"urgency_observed",
				"assessment_context_observed",
				"learner_evidence_observed",
				"failed_move_observed",
				"assistant_move_observed",
				"source_anchors_observed"
			],
			required: true
		},
		observation: {
			type: "object",
			additionalProperties: false,
			properties: {
				id: {
					type: "string",
					required: true
				},
				source: {
					type: "string",
					enum: [
						"learner-message",
						"learner-action",
						"assistant-output",
						"source-material"
					],
					required: true
				},
				summary: {
					type: "string",
					required: true
				},
				turn: { type: "integer" }
			},
			required: true,
			description: "One concrete session-local observation; never a personality or learning-style label."
		},
		goal: { type: "string" },
		requestKind: {
			type: "string",
			enum: [
				"concept",
				"procedure",
				"topic",
				"source-study",
				"practice",
				"resource",
				"direct-task",
				"unknown"
			]
		},
		level: {
			type: "string",
			enum: [
				"novice",
				"intermediate",
				"advanced",
				"unknown"
			]
		},
		items: {
			type: "array",
			items: { type: "string" }
		},
		mode: {
			type: "string",
			enum: ["append", "replace"]
		},
		objective: { type: "string" },
		steps: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				properties: {
					id: {
						type: "string",
						required: true
					},
					label: {
						type: "string",
						required: true
					}
				}
			}
		},
		activeStepId: { type: "string" },
		stepId: { type: "string" },
		gap: {
			type: "string",
			enum: [
				"concept",
				"procedure",
				"notation",
				"task-model",
				"prerequisite",
				"unknown"
			]
		},
		misconceptions: {
			type: "array",
			items: { type: "string" }
		},
		misconceptionMode: {
			type: "string",
			enum: ["append", "replace"]
		},
		readiness: {
			type: "string",
			enum: [
				"can-reason",
				"needs-foothold",
				"unknown"
			]
		},
		progressSignal: {
			type: "string",
			enum: [
				"progressing",
				"impatient",
				"stuck",
				"shutdown-risk",
				"unknown"
			]
		},
		urgency: {
			type: "string",
			enum: [
				"none",
				"initial-blocker",
				"later-pressure",
				"unknown"
			]
		},
		assessmentContext: {
			type: "string",
			enum: [
				"self-study",
				"graded",
				"unknown"
			]
		},
		evidence: { ...learnerEvidenceInput },
		failedMove: { ...failedMove },
		move: {
			type: "string",
			enum: [
				"none",
				"explanation",
				"example",
				"question",
				"guided_discovery",
				"worked_example",
				"reflective_pause",
				"resource",
				"repair",
				"transfer",
				"visual",
				"checkpoint"
			]
		},
		phase: {
			type: "string",
			enum: [
				"orient",
				"teach",
				"practice",
				"repair",
				"transfer",
				"complete"
			]
		},
		explanationSummary: { type: "string" },
		question: { type: "string" },
		learnerResponseAssessment: {
			type: "string",
			enum: [
				"correct",
				"partial",
				"incorrect",
				"no-evidence"
			]
		},
		currentMisconception: { type: "string" },
		nextMove: {
			type: "string",
			enum: [
				"calibrate",
				"direct",
				"explain",
				"example",
				"guided_discovery",
				"worked_example",
				"reflective_pause",
				"resource",
				"question",
				"repair",
				"transfer",
				"complete"
			]
		},
		moveFingerprint: { type: "string" },
		anchors: {
			type: "array",
			items: { type: "string" }
		}
	}
};
const learnerStateCorrection = {
	type: "object",
	additionalProperties: false,
	properties: {
		goal: { oneOf: [{ type: "string" }, { type: "null" }] },
		requestKind: {
			type: "string",
			enum: [
				"concept",
				"procedure",
				"topic",
				"source-study",
				"practice",
				"resource",
				"direct-task",
				"unknown"
			]
		},
		level: {
			type: "string",
			enum: [
				"novice",
				"intermediate",
				"advanced",
				"unknown"
			]
		},
		priorKnowledge: {
			type: "array",
			items: { type: "string" }
		},
		gap: {
			type: "string",
			enum: [
				"concept",
				"procedure",
				"notation",
				"task-model",
				"prerequisite",
				"unknown"
			]
		},
		misconceptions: {
			type: "array",
			items: { type: "string" }
		},
		readiness: {
			type: "string",
			enum: [
				"can-reason",
				"needs-foothold",
				"unknown"
			]
		},
		progressSignal: {
			type: "string",
			enum: [
				"progressing",
				"impatient",
				"stuck",
				"shutdown-risk",
				"unknown"
			]
		},
		urgency: {
			type: "string",
			enum: [
				"none",
				"initial-blocker",
				"later-pressure",
				"unknown"
			]
		},
		supportLevel: {
			type: "integer",
			enum: [
				0,
				1,
				2,
				3,
				4,
				5
			]
		},
		assessmentContext: {
			type: "string",
			enum: [
				"self-study",
				"graded",
				"unknown"
			]
		},
		mastery: {
			type: "string",
			enum: [
				"unseen",
				"emerging",
				"transfer"
			]
		},
		evidence: {
			type: "array",
			items: learnerEvidenceInput
		},
		failedMoves: {
			type: "array",
			items: failedMove
		},
		phase: {
			type: "string",
			enum: [
				"orient",
				"teach",
				"practice",
				"repair",
				"transfer",
				"complete"
			]
		},
		lastExplanationSummary: { oneOf: [{ type: "string" }, { type: "null" }] },
		lastQuestion: { oneOf: [{ type: "string" }, { type: "null" }] },
		learnerResponseAssessment: {
			type: "string",
			enum: [
				"correct",
				"partial",
				"incorrect",
				"no-evidence"
			]
		},
		currentMisconception: { oneOf: [{ type: "string" }, { type: "null" }] },
		nextMove: {
			type: "string",
			enum: [
				"calibrate",
				"direct",
				"explain",
				"example",
				"guided_discovery",
				"worked_example",
				"reflective_pause",
				"resource",
				"question",
				"repair",
				"transfer",
				"complete"
			]
		},
		moveFingerprint: { oneOf: [{ type: "string" }, { type: "null" }] },
		lastMove: {
			type: "string",
			enum: [
				"none",
				"explanation",
				"example",
				"question",
				"guided_discovery",
				"worked_example",
				"reflective_pause",
				"resource",
				"repair",
				"transfer",
				"visual",
				"checkpoint"
			]
		},
		sourceAnchors: {
			type: "array",
			items: { type: "string" }
		}
	}
};
const learnerStateUpdateOutput = {
	type: "object",
	additionalProperties: false,
	properties: {
		status: {
			type: "string",
			enum: [
				"updated",
				"corrected",
				"reset"
			],
			required: true
		},
		revision: {
			type: "integer",
			required: true
		}
	}
};
const VISUAL_KINDS = [
	"plot",
	"node_link",
	"scene_2d",
	"relation",
	"timeline",
	"formula_steps",
	"study_map",
	"recall_deck"
];
const VISUAL_CONTENT_SCHEMAS = {
	plot: plotContent,
	node_link: nodeLinkContent,
	scene_2d: sceneContent,
	relation: relationContent,
	timeline: timelineContent,
	formula_steps: formulaStepsContent,
	study_map: studyMapContent,
	recall_deck: recallDeckContent
};
const LEARNING_TOOL_PREFIX = "learning_";
const learningRoutes = /* @__PURE__ */ new WeakMap();
function textFromUserMessage(message) {
	return message.content.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
}
function routeContextText(decision) {
	if (decision.intent.intent === "not-learn") return [
		"## Current turn route",
		"intent=not-learn; route=direct.",
		"Treat this as an ordinary task. Do not calibrate, teach, update learner state, or use learning visual/checkpoint tools for this turn."
	].join("\n");
	return [
		"## Current turn route",
		`intent=learn; trigger=${decision.intent.trigger}; route=${decision.route}; reason=${decision.reason}.`,
		"Use this as a deterministic first-turn hint; the learner's evidence still determines the next teaching move."
	].join("\n");
}
const visualSelectorOutput = {
	type: "object",
	additionalProperties: false,
	properties: {
		status: {
			type: "string",
			const: "selected",
			required: true
		},
		kind: {
			type: "string",
			enum: VISUAL_KINDS,
			required: true
		}
	}
};
const visualSelectorParameters = {
	kind: {
		type: "string",
		enum: VISUAL_KINDS,
		required: true,
		description: "The one native representation that fits the relationship."
	},
	purpose: {
		type: "string",
		required: true,
		description: "One sentence naming the learner relationship this visual will make clearer."
	},
	learnerAction: {
		type: "string",
		description: "Optional semantic constraint: the one observation or manipulation the learner should make from the visual."
	},
	pairedQuestion: {
		type: "string",
		description: "Optional semantic constraint: the one focused question paired with the visual."
	}
};
function visualParameters(kind) {
	return {
		protocol: {
			type: "string",
			const: VISUAL_PROTOCOL_V4,
			required: true
		},
		title: {
			type: "string",
			description: "Concise visible and accessible visual title.",
			required: true
		},
		description: {
			type: "string",
			description: "Optional one-sentence exploration hint; do not repeat surrounding prose."
		},
		content: required(VISUAL_CONTENT_SCHEMAS[kind]),
		sequence,
		fallbackMarkdown: {
			type: "string",
			description: "Optional concise text equivalent for accessibility or an unavailable renderer."
		}
	};
}
const visualDescription = (kind) => [
	`Render one trusted, non-blocking semantic ${kind} visual selected for the current teaching move.`,
	"The selection step already chose the representation; now provide exactly that content kind.",
	"The call completes immediately. Continue with a self-sufficient ordinary-text interpretation and at most one natural question.",
	"Do not use a visual for a definition, short fact, or already-clear explanation. Keep labels in the learner's language and declare every relationship the learner needs to read.",
	"Hard limits and field-specific payload rules are encoded in this kind-specific schema. Never provide HTML, Markdown diagrams, SVG markup, or JavaScript."
].join(" ");
const checkpointSelectorParameters = {
	kind: {
		type: "string",
		enum: LEARNING_CHECKPOINT_KINDS,
		required: true
	},
	expectedEvidence: {
		type: "string",
		enum: LEARNING_CHECKPOINT_EVIDENCE_KINDS,
		required: true
	},
	prompt: {
		type: "string",
		required: true,
		description: "One answer-free prompt for the current teaching move."
	},
	purpose: {
		type: "string",
		required: true,
		description: "Why this response will change the next teaching move."
	}
};
const checkpointSelectorOutput = {
	type: "object",
	additionalProperties: false,
	properties: {
		status: {
			type: "string",
			const: "selected",
			required: true
		},
		kind: {
			type: "string",
			enum: LEARNING_CHECKPOINT_KINDS,
			required: true
		}
	}
};
const checkpointParameters = {
	protocol: {
		type: "string",
		const: CHECKPOINT_PROTOCOL,
		required: true
	},
	kind: {
		type: "string",
		enum: LEARNING_CHECKPOINT_KINDS,
		required: true
	},
	prompt: {
		type: "string",
		required: true
	},
	context: { type: "string" },
	expectedEvidence: {
		type: "string",
		enum: LEARNING_CHECKPOINT_EVIDENCE_KINDS,
		required: true
	},
	options: {
		type: "array",
		items: checkpointOption,
		description: "Required only for single_choice; 2 to 8 answer-free options."
	},
	fallbackMarkdown: {
		type: "string",
		required: true,
		description: "Self-sufficient ordinary-conversation fallback; never include the answer."
	}
};
const checkpointDescription = [
	"Optionally request one high-value reflective pause when the learner response materially changes the next teaching move.",
	"The normal path is ordinary conversation; this wire-compatible checkpoint is the sole deliberate user wait, not a per-turn ceremony or Continue ritual.",
	"The selection step already chose the evidence kind. The payload is answer-free: never include a correct answer, rubric, solution, future step, Reveal, animation, or Continue content.",
	"A skipped, cancelled, unavailable, or failed reflective pause falls back to ordinary conversation without withholding teaching."
].join(" ");
const dynamicVisualDisposers = /* @__PURE__ */ new WeakMap();
const dynamicCheckpointDisposers = /* @__PURE__ */ new WeakMap();
const GLOBAL_DYNAMIC_TOOL_KEY = {};
function dynamicToolTarget(services, exec) {
	const candidate = exec.agent;
	return typeof candidate?.id === "string" && candidate.ctx?.tools !== void 0 ? candidate.ctx.tools : services.tools;
}
function dynamicToolKey(_services, exec) {
	const candidate = exec.agent;
	return typeof candidate?.id === "string" && candidate.ctx?.tools !== void 0 ? candidate : GLOBAL_DYNAMIC_TOOL_KEY;
}
function assertSingleCheckpointInModelStep(exec) {
	const agent = exec.agent;
	if (agent === void 0) throw new LearningProtocolError(["learning_checkpoint requires a live agent session"]);
	const calls = agent.session.events.filter((event) => event.type === "tool/call");
	const ownCalls = calls.filter((event) => event.data.callId === exec.callId);
	if (ownCalls.length === 0) throw new LearningProtocolError(["learning_checkpoint callId is absent from the session tool/call log"]);
	if (new Set(ownCalls.map((event) => `${String(event.data.turn)}:${String(event.data.step)}`)).size !== 1 || ownCalls.some((event) => event.data.name !== "learning_checkpoint")) throw new LearningProtocolError(["learning_checkpoint callId does not identify one checkpoint model step"]);
	const own = ownCalls[ownCalls.length - 1];
	if (new Set(calls.filter((event) => event.data.turn === own.data.turn && event.data.step === own.data.step && event.data.name === "learning_checkpoint").map((event) => String(event.data.callId))).size > 1) throw new LearningProtocolError(["a model step may contain at most one learning_checkpoint call"]);
}
function apply(ctx) {
	const services = ctx;
	ctx.on("agent/inbox/claimed", ({ agent, message }) => {
		if (message.source.kind !== "user") return;
		const text = textFromUserMessage(message);
		if (text === "") return;
		learningRoutes.set(agent, routeLearningRequest(text));
	});
	ctx.on("tools/pre-execute", (execution, next) => {
		const agent = execution.agent;
		if ((agent === void 0 ? void 0 : learningRoutes.get(agent))?.intent.intent === "not-learn" && execution.name.startsWith(LEARNING_TOOL_PREFIX)) return Promise.resolve({
			kind: "deny",
			reason: "learning tools are disabled for an ordinary turn"
		});
		return next();
	});
	ctx.on("system-prompt/assemble", async (_assembly, context, next) => {
		const agent = context.agent;
		const decision = agent === void 0 ? void 0 : learningRoutes.get(agent);
		const assembly = await next();
		if (decision?.intent.intent !== "not-learn") return assembly;
		return {
			...assembly,
			sections: assembly.sections.filter((section) => section.name !== "learning:policy"),
			contexts: assembly.contexts.filter((context) => context.name !== "learning:learner-state"),
			tools: assembly.tools.filter((tool) => !tool.name.startsWith(LEARNING_TOOL_PREFIX))
		};
	});
	services.tools.register(closeParameterRoot(defineTool({
		name: "learning_visual_select",
		description: "Use only when a visual will materially clarify one relationship. Select one native kind, state its teaching purpose, and bind it to at least one learner action or paired question; the selected kind-specific learning_visual schema is exposed on the next model step. Do not select a visual for a definition, short fact, or already-clear explanation.",
		parameters: visualSelectorParameters,
		output: {
			schema: visualSelectorOutput,
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value)
			}]
		},
		isConcurrencySafe: () => false,
		async execute(args, exec) {
			const learnerAction = typeof args.learnerAction === "string" ? args.learnerAction.trim() : "";
			const pairedQuestion = typeof args.pairedQuestion === "string" ? args.pairedQuestion.trim() : "";
			if (learnerAction === "" && pairedQuestion === "") throw new TypeError("learning_visual_select requires learnerAction or pairedQuestion");
			const target = dynamicToolTarget(services, exec);
			const existing = target.get("learning_visual");
			const targetKey = dynamicToolKey(services, exec);
			if (existing !== void 0) {
				dynamicVisualDisposers.get(targetKey)?.();
				dynamicVisualDisposers.delete(targetKey);
			}
			const definition = closeParameterRoot(defineTool({
				name: "learning_visual",
				description: visualDescription(args.kind),
				parameters: visualParameters(args.kind),
				output: {
					schema: {
						type: "object",
						additionalProperties: false,
						properties: {
							protocol: {
								type: "string",
								const: VISUAL_RESULT_PROTOCOL_V4,
								required: true
							},
							status: {
								type: "string",
								enum: LEARNING_VISUAL_STATUSES,
								required: true
							}
						}
					},
					render: (_args, value) => [{
						type: "text",
						text: JSON.stringify(value)
					}]
				},
				isConcurrencySafe: () => true,
				async execute(payload, payloadExec) {
					parseLearningVisualV4(payload);
					try {
						return {
							protocol: VISUAL_RESULT_PROTOCOL_V4,
							status: services.learningActivities.recordVisual(payloadExec.agent, String(payloadExec.callId))
						};
					} finally {
						queueMicrotask(() => {
							const key = dynamicToolKey(services, payloadExec);
							const disposer = dynamicVisualDisposers.get(key);
							if (disposer !== void 0) {
								dynamicVisualDisposers.delete(key);
								disposer();
							}
						});
					}
				},
				presentCall: (payload) => ({
					card: "generic",
					title: typeof payload.title === "string" ? payload.title : "Interactive visual",
					kind: "other"
				})
			}));
			const disposer = target.register(definition);
			dynamicVisualDisposers.set(targetKey, disposer);
			return {
				status: "selected",
				kind: args.kind
			};
		}
	})));
	services.tools.register(closeParameterRoot(defineTool({
		name: "learning_state_update",
		description: [
			"Internal, immediate, non-rich session-state update from concrete observable evidence in the current learner message, learner action, or supplied source.",
			"Call only when the observation substantively changes the next teaching move; never call mechanically every turn and never infer a hidden trait, personality, emotion, or learning style.",
			"Use update for one new observation, correct only after an explicit user correction, and reset only at a real session-local learning-boundary reset.",
			"plan_observed records the route only when a multi-step goal genuinely needs one; plan_step_evidenced advances a step only from evidence the learner produced. A plan is never a checklist to march through, never announced every turn, and never a reason to continue after demonstrated transfer.",
			"The Host reads the current revision synchronously and applies compare-and-swap protection; do not invent or guess revision metadata.",
			"Assistant visual and checkpoint moves are recorded automatically; do not duplicate them here. This tool performs no user wait and must not replace ordinary conversation."
		].join(" "),
		parameters: {
			action: {
				type: "string",
				enum: [
					"update",
					"correct",
					"reset"
				],
				required: true
			},
			event: {
				...learnerStateEvent,
				description: "Required only for action=update; exactly one concrete observable state event."
			},
			correction: {
				...learnerStateCorrection,
				description: "Required only for action=correct; fields explicitly corrected by the user."
			},
			observation: {
				...userCorrectionObservation,
				description: "Required only for action=correct; the explicit user correction that justifies it."
			}
		},
		output: {
			schema: learnerStateUpdateOutput,
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value)
			}]
		},
		isConcurrencySafe: () => false,
		async execute(args, exec) {
			const agent = exec.agent;
			if (agent === void 0) throw new Error("learning_state_update requires a live agent session");
			const expectedRevision = services.learningActivities.learnerState(agent).revision;
			if (args.action === "update") {
				if (args.event === void 0 || args.correction !== void 0 || args.observation !== void 0) throw new TypeError("action=update requires only event");
				return services.learningActivities.updateLearnerState({
					action: "update",
					agent,
					expectedRevision,
					event: args.event
				});
			}
			if (args.action === "correct") {
				if (args.event !== void 0 || args.correction === void 0 || args.observation === void 0) throw new TypeError("action=correct requires only correction and observation");
				return services.learningActivities.updateLearnerState({
					action: "correct",
					agent,
					expectedRevision,
					correction: args.correction,
					observation: args.observation
				});
			}
			if (args.event !== void 0 || args.correction !== void 0 || args.observation !== void 0) throw new TypeError("action=reset accepts no event, correction, or observation");
			return services.learningActivities.updateLearnerState({
				action: "reset",
				agent,
				expectedRevision
			});
		}
	})));
	services.tools.register(closeParameterRoot(defineTool({
		name: "learning_checkpoint_select",
		description: "Use only for a reflective pause when one learner response will materially change the next teaching move. Select the evidence type, give one answer-free prompt and its purpose; the full learning_checkpoint payload is exposed on the next model step. Ordinary conversation remains the default, and this is the sole deliberate user wait—not a per-turn ceremony.",
		parameters: checkpointSelectorParameters,
		output: {
			schema: checkpointSelectorOutput,
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value)
			}]
		},
		isConcurrencySafe: () => false,
		async execute(args, exec) {
			const target = dynamicToolTarget(services, exec);
			const targetKey = dynamicToolKey(services, exec);
			dynamicCheckpointDisposers.get(targetKey)?.();
			const definition = closeParameterRoot(defineTool({
				name: "learning_checkpoint",
				description: checkpointDescription,
				parameters: checkpointParameters,
				output: {
					schema: checkpointOutput,
					render: (_args, value) => [{
						type: "text",
						text: JSON.stringify(value)
					}]
				},
				isConcurrencySafe: () => false,
				async execute(payload, payloadExec) {
					const checkpoint = parseLearningCheckpointV1(payload);
					assertSingleCheckpointInModelStep(payloadExec);
					return await services.learningActivities.presentCheckpoint({
						checkpoint,
						agent: payloadExec.agent,
						signal: payloadExec.signal,
						callId: String(payloadExec.callId)
					});
				}
			}));
			const disposer = target.register(definition);
			dynamicCheckpointDisposers.set(targetKey, disposer);
			return {
				status: "selected",
				kind: args.kind
			};
		}
	})));
	services.systemPrompt.section({
		name: "learning:policy",
		order: 20,
		text: LEARNING_TEACHING_POLICY
	});
	services.systemPrompt.context({
		name: "learning:turn-route",
		order: 19,
		text: (context) => {
			const agent = context.agent ?? services.agent;
			const decision = agent === void 0 ? void 0 : learningRoutes.get(agent);
			return decision === void 0 ? "" : routeContextText(decision);
		}
	});
	services.systemPrompt.context({
		name: "learning:learner-state",
		order: 20,
		text: (context) => {
			const agent = context.agent ?? services.agent;
			return agent === void 0 ? "" : services.learningActivities.learnerStateTranscript(agent, 300);
		}
	});
}
//#endregion
export { apply, inject, name };
