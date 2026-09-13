function define(script)
{
    script.Name = "bool_digitalizeFilter";
    script.Type = "EventCondition";
    return 0;
}

// Checks the current digitalized demon for type and/or variant values.
// If no demon is digitalized, the result is always false.
// - value1: Demon race to check or 0 for any
// - value2: Demon type to check or 0 for any (base type does not matter)
// - params: Key/value pair of additional parameters to check
function check(source, cState, dState, zone, value1, value2, params)
{
    local dgState = cState != null ? cState.GetDigitalizeState() : null;
    local demon = dgState != null ? dgState.GetDemon().Get() : null;
    if(demon != null)
    {
        // Race must match
        if(value1 != 0 && dgState.GetRaceID() != value1)
        {
            return -1;
        }

        // Type must match
        if(value2 != 0 && demon.GetType() != value2)
        {
            return -1;
        }

        // Additional params must match (key/value pair)
        for(local i = 0; i < (params.len() - 1); )
        {
            if(params[i] == "Mitama")
            {
                if((demon.GetMitamaType() != 0) != (params[i + 1].tointeger() == 1))
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