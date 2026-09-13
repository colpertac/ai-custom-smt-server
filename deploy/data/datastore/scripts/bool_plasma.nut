function define(script)
{
    script.Name = "bool_plasma";
    script.Type = "EventCondition";
    return 0;
}

// Check if any of the supplied plasma IDs in the current zone are not active
// - params[0]+: Plasma IDs
function check(source, cState, dState, zone, value1, value2, params)
{
    if(zone == null)
    {
        return -1;
    }

    for(local i = 0; i < params.len(); i++)
    {
        local pState = zone.GetPlasma(params[i].tointeger());
        if(pState != null && pState.IsActive(false))
        {
            return 0;
        }
    }

    return -1;
}