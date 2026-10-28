This is a review of a task, not the task itself. Do not do the clinical work. You have only read tools: there is no write tool and no finish tool.

Below is the instruction an agent receives for task {{task_id}}. Read it, then use the read tools to read everything it depends on: the clinic policies it names or that govern it (read_policy), the patients, orders, results, notes and inbox items it points at, and your own context (get_context).

Report every ambiguity you find, where a careful clinician could not tell what the task wants:
- two_readings: a sentence of the instruction or a policy reads two ways, and the two readings lead to different actions;
- missing_fact: a fact the work needs (a date, a dose, a threshold, a recipient, a patient) is not in the instruction, the policies or the chart;
- conflict: two sources (the instruction, a policy, a note, an order, a result) say different things about the same point.

Quote the exact words each finding rests on. Leave out what is only hard, long or clinically unusual but has one reading. If you find none, say so with an empty list.

End with one final message that holds only this JSON object, with no text before or after it:
{"findings": [{"kind": "two_readings" | "missing_fact" | "conflict", "source": "<instruction, or the policy id, or the resource as Type/id>", "quote": "<the exact words>", "readings": ["<what one reading asks the agent to do>", "<what another asks>"], "explanation": "<why a careful clinician could not tell which is meant>"}]}
Give readings two or more entries for two_readings and conflict, and none for missing_fact.

The instruction for {{task_id}}:

<instruction>
{{instruction}}
</instruction>
