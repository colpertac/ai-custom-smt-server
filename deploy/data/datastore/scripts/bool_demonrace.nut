function define(script)
{
    script.Name = "bool_demonRace";
    script.Type = "EventCondition";
    return 0;
}

// Checks the partner demon's race against a list of valid IDs.
// - params[0]+ = Valid IDs for the demon race
function check(source, cState, dState, zone, value1, value2, params)
{
    local devilData = dState != null ? dState.GetDevilData() : null;
    if(devilData)
    {
        local race = devilData.GetCategory().Race;
        for(local i = 0; i < params.len(); i++)
        {
            if(race == params[i].tointeger())
            {
                return 0;
            }
        }
    }

    return -1;
}