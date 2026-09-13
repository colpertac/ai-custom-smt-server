function define(script)
{
    script.Name = "action_barrierConfigure";
    script.Type = "ActionCustom";
    return 0;
}

// Causes an enemy to alter the number of status stacks on a status by a specified 
//value when attacked with any action type (only works with specific custom AI types)
// - params[0]: Value to change stack value by, for each action type (can be a comma delimited list)
// Actions are defined in this order: Attack, Spin, Rush, Shot, 
//Rapid, Guard, Counter, Dodge, Talk, Threaten, Taunt, Passive/None
// - params[1]: StatusID
// - params[2]: Event to fire if status expires.
function run(source, cState, dState, zone, server, params)
{
    if(params.len() < 3 || source == null)
    {
        return Result_t.FAIL;
    }

    local aiState = source.GetAIState();
    if(aiState == null)
    {
        return Result_t.FAIL;
    }

    aiState.SetActionOverridesEntry("ActionTypeIncrements", params[0]);
    aiState.SetActionOverridesEntry("BarrierEffect", params[1].tointeger());
    aiState.SetActionOverridesEntry("BarrierDown", params[2]);
    return Result_t.SUCCESS;
}