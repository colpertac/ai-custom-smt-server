function define(script)
{
    script.Name = "action_triggerSkill";
    script.Type = "ActionCustom";
    return 0;
}

// Trigger a skill on the current source entity (AI controlled or not)
// - params[0]: Skill ID to trigger
function run(source, cState, dState, zone, server, params)
{
    if(params.len() < 1 || source == null)
    {
        return Result_t.FAIL;
    }

    local aiState = source.GetAIState();

    local aiManager = server.GetAIManager();
    aiManager.QueueUseSkillCommand(source, params[0].tointeger(),
        aiState != null ? aiState.GetTargetEntityID() : 0,
        false);

    return Result_t.SUCCESS;
}