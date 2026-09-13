function define(script)
{
    script.Name = "bool_groupSpawned";
    script.Type = "EventCondition";
    return 0;
}

// Check if the supplied spawn (location) group has any living enemies
// - value1: current zone ID (for verification) or 0 for any
// - value2: spawn group ID, ignored if params specified
// - params[0]: Optional specifier of SpawnGroup or SpawnLocationGroup,
//   defaults to SpawnLocationGroup
// - params[1]+: Optional list of group IDs that will return true if
//   any of the groups have living enemies
function check(source, cState, dState, zone, value1, value2, params)
{
    local slg = params.len() == 0 || params[0] != "SpawnGroup";
    if(zone != null && (value1 == 0 || zone.GetDefinitionID() == value1))
    {
        if(params.len() > 1)
        {
            for(local i = 1; i < params.len(); i++)
            {
                if(zone.GroupHasSpawned(params[i].tointeger(), slg, true))
                {
                    return 0;
                }
            }

            return -1;
        }
        else
        {
            return zone.GroupHasSpawned(value2, slg, true) ? 0 : -1;
        }
    }

    return -1;
}