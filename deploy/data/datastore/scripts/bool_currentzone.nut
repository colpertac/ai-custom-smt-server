function define(script)
{
    script.Name = "bool_currentZone";
    script.Type = "EventCondition";
    return 0;
}

// Check if the current zone ID is one of the supplied values
// - params[0]+: list of valid zone IDs
function check(source, cState, dState, zone, value1, value2, params)
{
    if(zone == null)
    {
        return -1;
    }

    local zoneID = zone.GetDefinitionID();
    for(local i = 0; i < params.len(); i++)
    {
        if(params[i].tointeger() == zoneID)
        {
            return 0;
        }
    }

    return -1;
}