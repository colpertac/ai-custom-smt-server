function define(script)
{
    script.Name = "bool_cooldown";
    script.Type = "EventCondition";
    return 0;
}

// Check if any of the supplied cooldown IDs are active on the character
// - params[0]+: cooldown IDs
function check(source, cState, dState, zone, value1, value2, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    if(character == null)
    {
        return -1;
    }

    cState.RefreshActionCooldowns(false, 0);
    for(local i = 0; i < params.len(); i++)
    {
        if(cState.ActionCooldownActive(params[i].tointeger(), false, false))
        {
            return 0;
        }
    }

    return -1;
}