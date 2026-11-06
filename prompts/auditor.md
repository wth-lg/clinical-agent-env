You audit one finished trial of a clinical operations agent. You are blind to every other reviewer's labels: decide from the record below alone. Do not do the clinical work again. Say whose fault the current grade is, and whether the recorded outcome is clinically right.

The trial: {{trial}} (task {{task_id}}), current grade {{outcome}}.

# Labels

{{labels}}

# Definitions

The project's attribution definitions, imported from their one source. A fault applies when any one of its criteria holds; the precedence rule says which fault decides. Refer to criteria by id, and do not copy these sentences into your answer.

{{definitions}}

# What the agent was asked

System prompt:
<system>
{{system}}
</system>

Instruction:
<instruction>
{{instruction}}
</instruction>

# The trajectory

Each executed tool call is one step, numbered from 1 in the order the calls ran: a decisive_step you name is one of these numbers (1 to {{steps}}). The agent's own text is shown after "agent:". Tool results are shown as the tool returned them, cut at {{result_chars}} characters (policy texts are never cut); every cut is marked.

<trajectory>
{{trajectory}}
</trajectory>

# The grade

{{grade}}

# Record facts

{{facts}}

# Your answer

Decide:
- label: whose fault the current grade is, from the labels above. On a failure: model, environment or grader. On a PASS: pass when the PASS is right, grader when the grader passed work the policy fails (a false PASS).
- clinically_acceptable: is the recorded grade itself clinically right? yes or no. This asks about the grade, not about the agent's care. On a failure, yes means the failure is deserved: the agent's work fell short clinically, so the grade stands (the usual answer beside the label model). No means the grade is clinically wrong: a clinically acceptable solution was failed, which is the grader's or the environment's fault, never the model's. On a PASS, yes means the PASS is right; no means the PASS is not clinically right, a false PASS, labelled grader.
- tool_rejections_correct: was every tool rejection in the trajectory right? yes or no. no means a tool refused a valid call (criterion E6 says what counts); name that step as decisive_step.
- decisive_step: the step that decided the outcome (the write that set the wrong value, the refused call, or the last step before a write that never came), or null on a PASS.
- evidence_ids: the resource ids your verdict rests on (Type/id, as the trajectory shows them); at least one on a failure or a false PASS.
- criteria: the ids of the criteria above you find holding.
- reason: one or two sentences in your own words.

End with one final message that holds only this JSON object, with no text before or after it:
{"label": "<label>", "clinically_acceptable": "yes" | "no", "tool_rejections_correct": "yes" | "no", "decisive_step": <number or null>, "evidence_ids": ["<Type/id>", ...], "criteria": ["<id>", ...], "reason": "<text>"}
