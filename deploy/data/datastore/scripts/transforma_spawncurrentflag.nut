function define(script)
{
    script.Name = "transforma_spawnCurrentFlag";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionSpawn command by reading flag values 
// - params[0]+ = Key/value pairs for transformation types and contextual
//     sub-params. First two values in each pair need to be the flag type and
//     key. Flag types include ZONE, CHARACTER, INSTANCE, INSTANCE_CHARACTER.
//     Valid types include:
//     SpotID: Set the flag value as the explicit spot ID.
//     SpawnLocationGroupID: Appends a flag value to the valid spawn location
//         group IDs.
//     DefeatFlag: Copies the current value of a flag to another when the
//         group is defeated.
//     DefeatFlagCopy: Copies the current value of a flag to another based
//         on a second flag of the same type when the group is defeated.
function transform(source, cState, dState, zone, params)
{
    local worldCID = cState != null ? cState.GetWorldCID() : 0;
    if(zone == null || params.len() < 2)
    {
        return -1;
    }

    for(local i = 0; i < (params.len() - 2); )
    {
        local fType = params[i + 1];
        local flagSource = zone;
        if(fType == "INSTANCE" || fType == "INSTANCE_CHARACTER")
        {
            flagSource = zone.GetZoneInstance();
            if(flagSource == null)
            {
                return -1;
            }
        }

        local lookupCID = worldCID;
        if(fType == "CHARACTER" || fType == "INSTANCE_CHARACTER")
        {
            if(worldCID <= 0)
            {
                return -1;
            }
        }
        else
        {
            lookupCID = 0;
        }

        local value = flagSource.GetFlagState(params[i + 2].tointeger(), 0, lookupCID);
        if(params[i] == "SpotID")
        {
            action.SetSpotID(value);

            i += 3;
        }
        else if(params[i] == "SpawnLocationGroupID")
        {
            action.AppendSpawnLocationGroupIDs(value);

            i += 3;
        }
        else if(params[i] == "DefeatFlag" || params[i] == "DefeatFlagCopy")
        {
            if(params.len() < (i + 5))
            {
                return -1;
            }

            local flagAction = ActionUpdateZoneFlags();

            local fType2 = params[i + 3];
            if(fType2 == "INSTANCE")
            {
                flagAction.Type = ActionUpdateZoneFlags_type_t.ZONE_INSTANCE;
            }
            else if(fType2 == "CHARACTER")
            {
                flagAction.Type = ActionUpdateZoneFlags_type_t.ZONE_CHARACTER;
            }
            else if(fType2 == "INSTANCE_CHARACTER")
            {
                flagAction.Type = ActionUpdateZoneFlags_type_t.ZONE_INSTANCE_CHARACTER;
            }

            if(params[i] == "DefeatFlagCopy")
            {
                flagAction.SetFlagStatesEntry(flagSource.GetFlagState(
                    params[i + 4].tointeger(), 0, lookupCID), value);
            }
            else
            {
                flagAction.SetFlagStatesEntry(params[i + 4].tointeger(), value);
            }

            action.PrependDefeatActions(flagAction);

            i += 5;
        }
        else
        {
            i += 3;
        }
    }

    return 0;
}