function define(script)
{
    script.Name = "bool_demonFilter";
    script.Type = "EventCondition";
    return 0;
}

// Checks the partner demon against supplied filters. If no demon is summoned,
// the result is always false.
// - params: Key/value pair of parameters to check
function check(source, cState, dState, zone, value1, value2, params)
{
    local devilData = dState != null ? dState.GetDevilData() : null;
    if(devilData != null)
    {
        for(local i = 0; i < (params.len() - 1); )
        {
            if(params[i] == "Gender")
            {
                if(devilData.GetBasic().Gender != params[i + 1].tointeger())
                {
                    return -1;
                }
            }

            i += 2;
        }

        return 0;
    }

    return -1;
}