function define(script)
{
    script.Name = "transforma_dropsetAccessMultiply";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionCreateLoot command by adding a set of dropset IDs a supplied
// number of times based on the number of players that have instance access
// - params[0]+: Drop set ID then number of pairs of access counts then number of
//   times the drop set should be added
function transform(source, cState, dState, zone, params)
{
    if(zone == null || zone.GetZoneInstance() == null || params.len() < 4)
    {
        return -1;
    }

    local accessCount = zone.GetZoneInstance().OriginalAccessCIDsCount();
    if(accessCount == 0)
    {
        // Shouldn't happen
        return -1;
    }

    // Stash off the drop set IDs already there and put back later
    local dropSetIDs = action.GetDropSetIDs();
    action.ClearDropSetIDs();

    for(local i = 0; i < (params.len() - 1);)
    {
        local dropSetID = params[i].tointeger();
        local count = params[i + 1].tointeger();

        i += 2;

        local defArray = [];
        for(local k = i; k < (params.len() - 1) && ((k - i) * 2) < count;)
        {
            local aCount = params[k].tointeger();
            local multiplier = params[k + 1].tointeger();

            if(aCount > 0)
            {
                while(defArray.len() < aCount)
                {
                    defArray.append(0);
                }

                defArray[aCount - 1] = multiplier;
            }

            k += 2;
        }

        local multiplier = 0;
        for(local k = 0; k < accessCount && k < defArray.len(); k++)
        {
            if(defArray[k] != 0)
            {
                multiplier = defArray[k];
            }
        }

        for(local k = 0; k < multiplier; k++)
        {
            action.AppendDropSetIDs(dropSetID);
        }

        i += (2 * count);
    }

    // Put the existing drop set IDs back
    for(local i = 0; i < dropSetIDs.len(); i++)
    {
        action.AppendDropSetIDs(dropSetIDs[i]);
    }

    return 0;
}