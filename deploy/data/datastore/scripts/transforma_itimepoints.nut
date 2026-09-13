function define(script)
{
    script.Name = "transforma_iTimePoints";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionUpdatePoints command to ensure the character does not
// exceed the current I-Time rank using flags for boosting
// - params[0]: Min rank, if -1 ignore other params and rebase to last multiple
//   of the supplied value to "snap back"
// - params[1]: Max point value
// - params[2]: Optional CHARACTER_ZONE flag ID for boost percentage
function transform(source, cState, dState, zone, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    local progress = character ? character.GetProgress().Get() : null;
    local addPoints = action.GetValue();
    if(character == null || zone == null || progress == null ||
        params.len() < 1 || addPoints < 0)
    {
        return -1;
    }

    local minRank = params[0].tointeger();

    local points = progress.GetITimePointsByKey(action.GetModifier());
    local oldPoints = points;

    if(minRank == -1)
    {
        // Rebase using supplied value
        if((points - 1) % 2000 == 0)
        {
            // On rank min, nothing to do
        }
        else if(points % 2000 == 0)
        {
            // On rank max, nothing to do
        }
        else if(((points - 1) % 2000) % addPoints == 0)
        {
            // On multiple, nothing to do
        }
        else
        {
            // Reduce to multiple
            points = points - (((points - 1) % 2000) % addPoints);
        }
    }
    else if(params.len() < 2)
    {
        return -1;
    }
    else
    {
        local maxPoints = params[1].tointeger();

        // Calculated boosted amount if flag specified
        if(params.len() >= 3)
        {
            local flagVal = zone.GetFlagState(params[2].tointeger(), 0,
                cState.GetWorldCID());
            if(flagVal > 0)
            {
                addPoints = ((100 + flagVal) * addPoints) / 100;
            }
        }
    
        points = points + addPoints;

        // Lock at current rank
        for(local i = 0; i < (5 - minRank + 1); i++)
        {
            local max = 10000 - (i * 2000);
            if(oldPoints <= max && points > max)
            {
                points = max;
            }
        }

        if(points > maxPoints)
        {
            // Snap to max points
            points = maxPoints;
        }
    }

    action.SetValue(points);

    return 0;
}