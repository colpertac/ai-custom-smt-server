function define(script)
{
    script.Name = "action_triggerCounterSkill";
    script.Type = "ActionCustom";
    return 0;
}

// Set a counter triggered skill on the current source entity that is AI
// controlled (only works with specific custom AI types)
// - params[0]: Skill ID to counter with (can be a comma delimited list)
// - params[1]: Optional action type to counter when hit by
function run(source, cState, dState, zone, server, params)
{
    if(params.len() < 2 || source == null)
    {
        return Result_t.FAIL;
    }

    local aiState = source.GetAIState();
    if(aiState == null)
    {
        return Result_t.FAIL;
    }

    aiState.SetActionOverridesEntry("CounterSkill", params[0].tointeger());
    aiState.SetActionOverridesEntry("CounterActionType", params[1].tointeger());

    return Result_t.SUCCESS;
}