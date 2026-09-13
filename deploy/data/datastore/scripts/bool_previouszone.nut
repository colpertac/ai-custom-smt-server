function define(script)
{
    script.Name = "bool_previousZone";
    script.Type = "EventCondition";
    return 0;
}

// Check if the current character's previous zone is any of the supplied values
// - params[0]+: Zone IDs
function check(source, cState, dState, zone, value1, value2, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    if(character == null)
    {
        return -1;
    }

    for(local i = 0; i < params.len(); i++)
    {
        if(params[i].tointeger() == character.PreviousZone)
        {
            return 0;
        }
    }

    return -1;
}