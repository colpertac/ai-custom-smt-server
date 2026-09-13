function define(script)
{
    script.Name = "bool_enemyFilter";
    script.Type = "EventCondition";
    return 0;
}

// Checks an enemy for various spawn values.
// - value1: Enemy type to check or 0 for any
// - value2: Enemy variant to check or 0 for any
// - params: Key/value pair of additional parameters to check
function check(source, cState, dState, zone, value1, value2, params)
{
    local eBase = source != null ? source.GetEnemyBase() : null;
    if(eBase != null)
    {
        // Type must match
        if(value1 != 0 && eBase.GetType() != value1)
        {
            return -1;
        }

        // Variant must match
        if(value2 != 0 && eBase.GetVariantType() != value2)
        {
            return -1;
        }

        // Additional params must match (key/value pair)
        if(params.len() > 0)
        {
            for(local i = 0; i < (params.len() - 1); )
            {
                if(params[i] == "TypeAny")
                {
                    local any = false;

                    local vals = split(params[i + 1], ",");
                    foreach(sgStr in vals)
                    {
                        any = any || sgStr.tointeger() == eBase.GetType();
                    }

                    if(!any)
                    {
                        return -1;
                    }
                }
                else if(params[i] == "SpawnGroupID")
                {
                    if(params[i + 1].tointeger() != eBase.GetSpawnGroupID())
                    {
                        return -1;
                    }
                }
                else if(params[i] == "SpawnGroupIDAny")
                {
                    local any = false;

                    local vals = split(params[i + 1], ",");
                    foreach(sgStr in vals)
                    {
                        any = any || sgStr.tointeger() == eBase.GetSpawnGroupID();
                    }

                    if(!any)
                    {
                        return -1;
                    }
                }
                else if(params[i] == "SpawnLocationGroupID")
                {
                    if(params[i + 1].tointeger() != eBase.GetSpawnLocationGroupID())
                    {
                        return -1;
                    }
                }

                i += 2;
            }
        }

        return 0;
    }

    return -1;
}