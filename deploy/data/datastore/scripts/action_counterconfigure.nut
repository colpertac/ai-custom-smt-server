function define(script)
{
    script.Name = "action_counterConfigure";
    script.Type = "ActionCustom";
    return 0;
}

// Causes an enemy to decrement a counter each time it selects a skill and fires an
// event once it reaches 0 (only works with specific custom AI types)
// - params[0]: Initial counter value.
// - params[1]: Event to fire if status expires.
// - params[2]: Optional StatusID to check
// - params[3]: Target will cancel normal skills while counting.
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

    aiState.SetActionOverridesEntry("initialCounter", params[0]);
    aiState.SetActionOverridesEntry("counterEvent", params[1]);

    if(params.len() > 2)
    {
        aiState.SetActionOverridesEntry("statusActive", params[2]);
    
    }
    if(params.len() > 3)
    {
        aiState.SetActionOverridesEntry("passiveWhileActive", params[3]);
    }
    return Result_t.SUCCESS;
}